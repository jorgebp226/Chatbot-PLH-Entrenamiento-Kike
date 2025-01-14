import { addKeyword, EVENTS } from '@builderbot/bot';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';


dotenv.config();


/**
 * Función para obtener el ID, contexto y mensajes de un grupo de WhatsApp
 * @param {string} groupName - Nombre del grupo a buscar
 * @param {Object} provider - Proveedor de WhatsApp
 * @returns {Object|null} - Objeto con ID, contexto y mensajes del grupo o null si no se encuentra
 */
export const getGroupId = async (groupName, provider) => {
  try {
      // Obtener la instancia del proveedor
      const refProvider = await provider.getInstance();
      
      // Obtener todos los chats
      const chats = await refProvider.groupFetchAllParticipating();
      
      // Buscar el grupo por nombre
      for (const [id, chat] of Object.entries(chats)) {
          if (chat.subject?.toLowerCase() === groupName.toLowerCase()) {
              // Obtener metadatos del grupo
              const metadata = await refProvider.groupMetadata(id);
              
              // Configurar escucha de mensajes del grupo
              refProvider.ev.on('messages.upsert', ({ messages }) => {
                  messages.forEach(message => {
                      if (message.key.remoteJid === id) {
                          console.log('Nuevo mensaje en el grupo:', {
                              sender: message.key.participant,
                              content: message.message?.conversation || 
                                      message.message?.extendedTextMessage?.text ||
                                      'Contenido multimedia',
                              timestamp: message.messageTimestamp
                          });
                      }
                  });
              });

              // Construir el objeto de contexto
              const groupContext = {
                  id: id,
                  name: chat.subject,
                  metadata: {
                      owner: metadata.owner,
                      participants: metadata.participants.map(participant => ({
                          id: participant.id,
                          admin: participant.admin ? true : false,
                      })),
                      participantsCount: metadata.participants.length,
                      description: metadata.desc,
                      creation: metadata.creation,
                      settings: {
                          announce: metadata.announce,
                          restricted: metadata.restrict,
                          ephemeralDuration: metadata.ephemeralDuration
                      }
                  },
                  lastMessageTimestamp: chat.conversationTimestamp,
                  unreadCount: chat.unreadCount || 0
              };

              return groupContext;
          }
      }
      
      return null;
  } catch (error) {
      console.error('Error al buscar el grupo:', error);
      return null;
  }
};

/**
* Función para escuchar mensajes de un grupo específico
* @param {string} groupId - ID del grupo a escuchar
* @param {Object} provider - Proveedor de WhatsApp
* @returns {Function} - Función para detener la escucha
*/
export const listenToGroupMessages = async (groupId, provider) => {
  const refProvider = await provider.getInstance();
  
  const listener = ({ messages }) => {
      messages.forEach(message => {
          if (message.key.remoteJid === groupId) {
              const messageData = {
                  messageId: message.key.id,
                  sender: message.key.participant,
                  timestamp: message.messageTimestamp,
                  content: message.message?.conversation || 
                          message.message?.extendedTextMessage?.text ||
                          message.message?.imageMessage?.caption ||
                          'Contenido multimedia',
                  type: getMessageType(message)
              };
              console.log('Mensaje recibido:', messageData);
              // Aquí puedes agregar tu lógica para procesar el mensaje
          }
      });
  };

  refProvider.ev.on('messages.upsert', listener);
  
  // Retornar función para detener la escucha
  return () => {
      refProvider.ev.off('messages.upsert', listener);
  };
};

const getMessageType = (msg) => {
  if (msg.message?.conversation) return 'text';
  if (msg.message?.imageMessage) return 'image';
  if (msg.message?.videoMessage) return 'video';
  if (msg.message?.audioMessage) return 'audio';
  if (msg.message?.documentMessage) return 'document';
  if (msg.message?.stickerMessage) return 'sticker';
  if (msg.message?.contactMessage) return 'contact';
  if (msg.message?.locationMessage) return 'location';
  return 'other';
};



/**
 * Función para verificar si el bot es miembro del grupo
 * @param {object} provider - Instancia del provider
 * @param {string} groupJid - ID del grupo
 * @returns {Promise<boolean>}
 */
export const isBotGroupMember = async (provider, groupJid) => {
  try {
    const refProvider = await provider.getInstance();
    const groupMetadata = await refProvider.groupMetadata(groupJid);
    const botNumber = refProvider.user.id.split(':')[0];
    
    return groupMetadata.participants.some(
      participant => participant.id.split('@')[0] === botNumber
    );
  } catch (error) {
    console.error('Error al verificar membresía del grupo:', error);
    return false;
  }
};

/**
 * Verifica si un mensaje viene de un grupo
 * @param {object} message - Mensaje a verificar
 * @returns {boolean}
 */
export const isGroupMessage = (message) => {
  if (!message?.key?.remoteJid) return false;
  return message.key.remoteJid.endsWith('@g.us');
};

/**
 * Flow para manejar mensajes de grupo
 */
export const flowGroupMessages = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { provider }) => {
        try {
            if (!isGroupMessage(ctx)) return;

            const jid = ctx.key.remoteJid;
            const refProvider = await provider.getInstance();
            const groupMetadata = await refProvider.groupMetadata(jid);

            // Retornar información relevante del mensaje
            return {
                groupId: jid,
                groupName: groupMetadata.subject,
                message: ctx.body,
                sender: ctx.key.participant,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error al procesar mensaje de grupo:', error);
            return null;
        }
    });

/**
 * Procesa un mensaje de grupo sin interferir con otros flujos
 * @param {object} ctx - Contexto del mensaje
 * @param {object} provider - Proveedor de WhatsApp
 * @returns {Promise<object|null>}
 */
export const processGroupMessage = async (ctx, provider) => {
    try {
        if (!isGroupMessage(ctx)) return null;
        
        return await flowGroupMessages.executeAction(ctx, { provider });
    } catch (error) {
        console.error('Error al procesar mensaje de grupo:', error);
        return null;
    }
};
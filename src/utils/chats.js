import dotenv from 'dotenv';
import { DynamoDBLeads } from '../services/dynamoDBLeads.js';
import axios from 'axios';
dotenv.config();

const dynamoDBLeads = new DynamoDBLeads();

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

// Funciones para el procesamiento de respuestas de presupuestos
const extractInfoFromMessage = (message) => {
  try {
      const regex = {
          id_proyecto: /ID Proyecto:\s*([^\n]+)/i,
          direccion: /Dirección:\s*([^\n]+)/i,
          excavacion: /Excavación:\s*([^\n]+)/i,
          medidas: /Medidas piscina:\s*(\d+x\d+)\s*metros/i,
          superficie: /Superficie parcela:\s*(\d+)\s*m²/i,
          coronacion: /Coronación:\s*([^\n]+)/i,
          interior: /Interior:\s*([^\n]+)/i
      };

      const info = {};
      for (const [key, reg] of Object.entries(regex)) {
          const match = message.match(reg);
          if (match) {
              info[key] = match[1].trim();
          }
      }

      return info;
  } catch (error) {
      console.error('Error extrayendo información:', error);
      return null;
  }
};

const formatExtractedInfo = (originalInfo, response) => {
  const presupuesto = response.replace(/[^0-9]/g, '');
  
  return {
      id_proyecto: originalInfo.id_proyecto || 'No especificado',
      direccion: originalInfo.direccion || 'No especificada',
      excavacion: originalInfo.excavacion || 'No especificada',
      medidas: originalInfo.medidas || 'No especificadas',
      superficie: originalInfo.superficie || 'No especificada',
      coronacion: originalInfo.coronacion || 'No especificada',
      interior: originalInfo.interior || 'No especificado',
      presupuesto: presupuesto ? `${presupuesto}€` : 'No especificado'
  };
};

const procesarRespuestaPresupuesto = async (message, quotedMessage) => {
  try {
      console.log('\n[PROCESAMIENTO DE RESPUESTA DE PRESUPUESTO]');
      console.log('Mensaje recibido:', message);

      if (!quotedMessage) {
          console.log('No es una respuesta a un mensaje');
          return;
      }

      const originalText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;

      console.log('Mensaje original:', originalText);
      console.log('Respuesta:', message);

      if (!originalText || !originalText.includes('Dirección:')) {
          console.log('El mensaje original no tiene el formato esperado');
          return;
      }

      const extractedInfo = extractInfoFromMessage(originalText);
      if (!extractedInfo) {
          console.log('No se pudo extraer información del mensaje');
          return;
      }

      const formattedInfo = formatExtractedInfo(extractedInfo, message);

      const apiData = {
          projectId: formattedInfo.id_proyecto,
          budget: parseInt(formattedInfo.presupuesto.replace('€', ''))
      };

      try {
          await axios.post('https://uhxj6wkk88.execute-api.eu-west-3.amazonaws.com/MessageSender_v1/send_pricing', apiData);
          console.log('Presupuesto enviado exitosamente a la API');
          
      } catch (error) {
          console.error('Error al enviar a la API:', error);
      }

          console.log('Mensaje que se envía:', apiData);

         const project = await dynamoDBLeads.getProject(apiData.projectId);
         console.log(project);

         await dynamoDBLeads.saveBudget(apiData.projectId, apiData.budget);

  } catch (error) {
      console.error('[ERROR EN PROCESAMIENTO DE PRESUPUESTO]', error);
      console.error('Stack trace:', error.stack);
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
          type: getMessageType(message),
          quotedMessage: message.message?.extendedTextMessage?.quotedMessage || message.message?.extendedTextMessage?.contextInfo?.quotedMessage
        };
        console.log('Mensaje recibido:', messageData);
        // Aquí puedes agregar tu lógica para procesar el mensaje
        console.log('VAMOS A PROCESAR LA RESPUESTA');
        if(messageData.quotedMessage != '') {
          procesarRespuestaPresupuesto(messageData.content, messageData.quotedMessage);
        }     
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


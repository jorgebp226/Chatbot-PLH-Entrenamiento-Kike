import dotenv from 'dotenv';
import { DynamoDBLeads } from '../services/dynamoDBLeads.js';
import axios from 'axios';
import { DynamoDBPhoneNumbers } from '../services/dynamoDBPhoneNumbers.js';
import { S3Buckets } from '../services/s3buckets.js';
dotenv.config();

const dynamoDBLeads = new DynamoDBLeads();
const dynamoDBPhoneNumbers = new DynamoDBPhoneNumbers();
const FRIEND_NUMBER = process.env.FRIEND_NUMBER;


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

    const project = await dynamoDBLeads.getProject(apiData.projectId);
    console.log(project);

    console.log('Mensaje que se envía:', apiData);

    await dynamoDBLeads.saveBudget(apiData.projectId, apiData.budget);

    // Modificación aquí para manejar la imagen
    let image = null;
    try {
      image = await S3Buckets.getLatestImageUrlForUser(project.phone);
    } catch (imageError) {
      console.log('No se pudo obtener la imagen:', imageError);
    }
    console.log("imagen ", image);

    const payload = {
      number: FRIEND_NUMBER,
      message: `ID Proyecto: ${project.id}\n` +
        `Nombre: ${project.name || 'No especificado'}\n` +
        `Teléfono: ${project.phone || 'No especificado'}\n` +
        `Dirección: ${project.address || 'No especificada'}\n` +
        `Dimensiones: ${project.poolDimensions?.length?.N || '0'}x${project.poolDimensions?.width?.N || '0'} m\n` +
        `Parcela: ${project.parcelDimensions?.area?.N || '0'} m²\n` +
        `Excavación: grúa Telescópica\n` +
        `Coronación: ${project.Coronacion || 'No especificada'}\n` +
        `Interior: ${project.Interior || 'No especificado'}\n` +
        `Presupuesto: ${project.budget || '0'} €\n`
    };

    try {
      await axios.post('http://13.38.95.223:3000/send-message', payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error al enviar a la API:', error);
      // Agregar más información del error para debugging
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
    }

    const payload_image = {
      phoneNumber: FRIEND_NUMBER,
      message: project.id,
      mediaUrl: image 
    };

    try {
      await axios.post('http://35.181.166.88:3001/send-message', payload_image, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error al enviar a la API:', error);
      // Agregar más información del error para debugging
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
    }

    const payload_short = {
      number: FRIEND_NUMBER,
      message: `.....`
    };

    try {
      await axios.post('http://13.38.95.223:3000/send-message', payload_short, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.error('Error al enviar a la API:', error);
      // Agregar más información del error para debugging
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
    }


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

  // Remove all existing 'messages.upsert' listeners
  refProvider.ev.removeAllListeners('messages.upsert');

  // Set a higher max listeners limit if needed
  //refProvider.ev.setListeners(100)

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
        if (messageData.quotedMessage != '') {
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


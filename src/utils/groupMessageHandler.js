import { addKeyword, EVENTS } from '@builderbot/bot';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_APIKEY});

export class GroupMessageHandler{
    constructor(provider) {
        this.provider = provider;
    }

    //Verificamos si es un mensaje de un grupo

    isGroupMessage(message) {
        return message?.key?.remoteJid?.endsWith('@g.us') || false;
    }

    //Obtenemos los metadatos del grupo

    async getGroupMetadata(jid){
        try {
            const provider = await this.provider.getInstance();
            return await provider.groupMetadata(jid);
        } catch (error) {
            console.error('Error obteniendo los metadatos del grupo: ', error);
            return null;
        }    
    }

    // Verifica si el bot es miembro del grupo
    async isBotMember(groupJid) {
        try{
            const provider = await this.provider.getInstance();
            const metadata = await this.getGroupMetadata(groupJid);
            const botNumber = provider.user.id.split(':')[0];

            return metadata?.participants.some(
                p => p.id.split('@')[0] === botNumber
            );
        } catch(error) {
            console.error('Error verificando que el usuario sea miembro del grupo: ', error);
            return null;
        }
    }

    //Procesamos el mensaje del grupo
    async processMessage(ctx){
        try{
            if(!this.isGroupMessage(ctx)){
                return null;
            }

            const groupJid = ctx.key.remoteJid;
            const metadata = await this.getGroupMetadata(groupJid);
            const isMember = await this.isBotMember(groupJid);

            if (!isMember || !metadata) {
                return null;
            }

            const messageData = {
                groupId: groupJid,
                groupName: metadata.subject,
                message: ctx.body || ctx.message?.conversation,
                sender: ctx.key.participant,
                timestamp: new Date().toISOString(),
                messageType: this.getMessageType(ctx)
            };

            await this.handleGroupMessage(messageData);
            
            return messageData;
        } catch(error) {
            console.error('Error en el procesao del mensaje del grupo: ', error);
            return null;
        }
    }

    // Identifica el tipo de mensaje
    getMessageType(ctx) {
        if (ctx.message?.imageMessage) return 'image';
        if (ctx.message?.audioMessage) return 'audio';
        if (ctx.message?.videoMessage) return 'video';
        if (ctx.message?.documentMessage) return 'document';
        return 'text';
    }

    // Maneja el mensaje según tipo y contenido
    async handleGroupMessage(messageData) {
        console.log('Procesando mensaje de grupo: ', messageData);
    }
}

export const createGroupMessageFlow = (handler) => {
    return addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { flowDynamic, provider }) => {
        try {
            const messageData = await handler.processMessage(ctx);

            if (messageData) {
                //agregar respuestas automáticas
                console.log('Mensaje recibido: ', messageData.groupName);
            }
        } catch(error) {
            console.error('Error en el flow de mensajes de grupo: ', error);
        }
    });
}

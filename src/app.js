import { createBot, createProvider, createFlow, MemoryDB } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { allFlows } from './flows/index.js';
import { initializeDataFiles } from './utils/flow-manager.js';
import dotenv from 'dotenv';
import { httpInject } from "@builderbot-plugins/openai-assistants";
import { createGroupMessageFlow, GroupMessageHandler } from './utils/groupMessageHandler.js';
//import { messageFromGroup } from './flows/training.js';

// Initialize environment variables
dotenv.config();

const PORT = process.env.PORT ?? 3000

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is required in .env file');
    process.exit(1);
}

const main = async () => {
    try {
        // Initialize data files and directories
        await initializeDataFiles();

        // Initialize adapters
        const adapterDB = new MemoryDB();
        //const adapterFlow = createFlow(allFlows);
        
        // Configure provider with specific options
        const adapterProvider = createProvider(BaileysProvider, {
            // Enable file downloads
            downloadMedia: true,
            // Optional: Configure browser details
            browser: ['Pool Lead Handler', 'Chrome', '120.0.0'],
            // Optional: Configure connection options
            connection: {
                printQRInTerminal: true,
                downloadHistory: true
            }
        });

        // Inicializar el handler de mensajes de grupo
        const groupHandler = new GroupMessageHandler(adapterProvider);

        // Crear un flow específico para mensajes de grupo
       /* const groupMessageFlow = addKeyword(EVENTS.MESSAGE)
            .addAction(async (ctx, { provider }) => {
                console.log('Mensaje recibido:', ctx.body);
                
                // Verificar si es un mensaje de grupo
                if (ctx.key?.remoteJid?.endsWith('@g.us')) {
                    console.log('Mensaje de grupo detectado');
                    const messageData = await groupHandler.processMessage(ctx);
                    console.log('Mensaje procesado:', messageData);
                }
            });*/

        //Agregar el flow de mensajes de grupo a los flows existentes
        const flows = [...allFlows, /*groupMessageFlow*/];
        const adapterFlow = createFlow(flows);

        // Create bot with all configurations
        const {httpServer} = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
            // Additional settings for media handling
            settings: {
               saveMedia: true,
               mediaPath: './data/media',
               qrPath: './data/qr'
            }
        });

        httpInject(adapterProvider.server);
        httpServer(+PORT);
        
        // ENDPOINT PARA GRUPO DE WHATSAPP
        // numero de whatsapp 456346356@s.whatsapp.net
        //----------------------------------------------------------------------
        adapterProvider.server.post('/send-message', async ( req, res) => {
            try {
                const body = req.body;
                const message = body.message;
                const mediaUrl = body.mediaUrl;
                const groupId = '120363362666788383@g.us';

                const provider = adapterProvider.getInstance();
                console.log("mediaUrl", mediaUrl);

                // Preparar el mensaje según si hay media o no
                if (mediaUrl) {
                    // Mensaje con media
                    await provider.sendMessage(groupId, {
                        image: { url: mediaUrl }, // Para imágenes
                        caption: message
                    });
                } else {
                    // Mensaje de solo texto
                    await provider.sendMessage(groupId, {
                        text: message
                    });
                }

                // Envía la respuesta para completar la solicitud HTTP
                res.end(JSON.stringify({ status: 'success' }));
            } catch (error) {
                console.error('Error al enviar mensaje:', error);
                
                // Determinar el tipo de error para dar una mejor respuesta
                const errorMessage = error.message?.includes('Timed Out') 
                    ? 'Tiempo de espera agotado. Por favor, intente nuevamente.' 
                    : error.message;
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    status: 'error', 
                    message: errorMessage 
                }));
            }

           if (groupHandler.isBotMember('120363388728191905@g.us')) {
                console.log('\n[PROCESANDO MENSAJE DEL NÚMERO DE PRESUPUESTOS]');
                console.log('Número detectado:');
                console.log('Contenido:');
                //await procesarRespuestaPresupuesto(ctx, flowDynamic);
            }

        });

        adapterProvider.server.get('/get-message', (req, res) => {
            res.end('esto es el server contestando');
        });
        //-----------------------------------------------------------------------

        console.log('\n=== Bot Trainer Initialized ===');
        console.log('- Use "entrenar" to start training mode');
        console.log('- Use "salir" to exit training mode');
        console.log('- Start messages with "Modificar:" to suggest changes');
        console.log('=============================\n');
    } catch (error) {
        console.error('Error initializing the bot:', error);
    }
};

main();
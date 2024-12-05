import { createBot, createProvider, createFlow, MemoryDB } from '@builderbot/bot';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { allFlows } from './flows/index.js';
import { initializeDataFiles } from './utils/flow-manager.js';
import dotenv from 'dotenv';

// Initialize environment variables
dotenv.config();

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
        const adapterFlow = createFlow(allFlows);
        const adapterProvider = createProvider(BaileysProvider);

        // Create and initialize bot
        const { httpServer } = await createBot({
            flow: adapterFlow,
            provider: adapterProvider,
            database: adapterDB,
        });

        // Initialize HTTP server if needed
        if (httpServer) {
            httpServer(3000);
        }

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
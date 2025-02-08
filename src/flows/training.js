import { addKeyword, EVENTS } from '@builderbot/bot';
import { OpenAI } from 'openai';
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import { S3Buckets } from '../services/s3buckets.js';
import { DynamoDBService } from '../services/dynamodb.js';
import { DynamoDBServiceBussiness } from '../services/dynamoDBBussiness.js';
import { DynamoDBPhoneNumbers } from '../services/dynamoDBPhoneNumbers.js';
import { getGroupId, listenToGroupMessages, listenerState } from '../utils/chats.js';
import dotenv from 'dotenv';


// Initialize environment variables
dotenv.config();

// Id Bussiness
const bussinessId = process.env.BUSSINES_ID;
// Initialize OpenAI
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey });

// File paths
const DATA_DIR = join(process.cwd(), 'data');

// Inicializar el servicio de DynamoDB
const dynamoService = new DynamoDBService();
const dynamoServiceBussiness = new DynamoDBServiceBussiness();
const dynamoDBPhonenNumbers = new DynamoDBPhoneNumbers();


// Prompts paths
const PROMPT_DIR = join(process.cwd(), 'src/prompts');

// Media paths
const AUDIO_DIR = join(process.cwd(), 'voice_notes');
const IMAGE_DIR = join(process.cwd(), 'images');

// Constants
const REGEX_ANY_CHARACTER = '/^.+$/';
var phoneNumber = 0;
//var idGroup = 0;

//Group for sending the message
const GROUP_ID = process.env.GROUP_ID;
const GROUP_NAME = process.env.GROUP_NAME;

// Delay response variable
const VARIABLES_CHAT = join(DATA_DIR, 'variables_chat.json');
const message_delay_file = readFileSync(VARIABLES_CHAT, 'utf-8');
var variables_chat_json = JSON.parse(message_delay_file);
var message_delay = variables_chat_json.delay_Time_Response;

// Enhanced logging function
const logInfo = (context, message, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] [${context}]`);
    console.log(`Message: ${message}`);
    if (data) {
        console.log('Data:', JSON.stringify(data, null, 2));
    }
    console.log('-'.repeat(80));
};

logInfo("tiempo de respuesta incial: ", message_delay);


// Function to process audio messages
const processAudioMessage = async (ctx, provider) => {
    try {
        const localPath = await provider.saveFile(ctx, { path: AUDIO_DIR });
        console.log('Ruta del archivo de audio local:', localPath);

        // Leer el archivo de audio
        const audioData = createReadStream(localPath);

        // Transcribir el audio usando OpenAI
        const transcribeResponse = await openai.audio.transcriptions.create({
            file: audioData,
            model: 'whisper-1',
        });
        console.log('Se comienza la transcripcion');
        const transcription = transcribeResponse.text;
        console.log('Respuesta del asistente de OpenAI:', transcription);

        return transcription;

    } catch (error) {
        logInfo('processAudioMessage', 'Error processing audio message', { error: error.message });
        return null;
    }
};

// Function to process image messages

const processImageMessage = async (ctx, provider) => {
    try{
        const localPath = await provider.saveFile(ctx, {path: IMAGE_DIR });
        console.log('Ruta del archivo de imagen local:', localPath);
    } catch (error) {
        logInfo('processImageMessage', 'Error processing image message', { error: error.message });
        return null;
    }
}

const listenToGroup = async (ctx, provider) => {

    const groupInfo = await getGroupId(GROUP_NAME, provider);

    if( await groupInfo != null ) {
        logInfo('Id del grupo', groupInfo.id);
        //logInfo('Participantes ', groupInfo.metadata);

        logInfo('isListening', listenerState.isListening);
        if (listenerState.isListening === false) {
            const stopListening = listenToGroupMessages(groupInfo.id, provider);
        } else {
            logInfo('Existe un listener activo');
        }
    }
    return;
}

// Función auxiliar para manejar mensajes (texto o voz)
const handleMessage = async (ctx, provider) => {

    phoneNumber = ctx.from.replace('@s.whatsapp.net', '');
    logInfo("numero del usuario: ", phoneNumber);
    listenToGroup(ctx, provider);

    // Si es un mensaje de voz
    if (ctx.message?.audioMessage || ctx.message?.messageContextInfo?.messageContent?.audioMessage) {
        try {           
            const file = await provider.saveFile(ctx);
            await S3Buckets.uploadMedia(phoneNumber, file, 'audio');
            const transcript = processAudioMessage(ctx, provider);
            return transcript;
        } catch (error) {
            console.error('Error procesando audio:', error);
            return null;
        }
    } else if( ctx.message?.imageMessage || ctx.message?.messageContextInfo?.messageContent?.imageMessage) {
       try{ 
            //processImageMessage(ctx, provider);
            const file = await provider.saveFile(ctx);
            await S3Buckets.uploadMedia(phoneNumber, file, 'image');
            return ctx.body;
       } catch(error) {
            console.error('Error en el procesado de la imagen', error);
            return null;
       }
    } else {
        // Si es un mensaje de texto
        return ctx.body;
    }
};

// Function to generate new prompt based on modifications
const generateNewPrompt = async (modifications) => {
    try {
        const currentPrompt = await dynamoService.getPrompt(phoneNumber);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an AI that improves chatbot prompts based on user feedback and modifications."
                },
                {
                    role: "user",
                    content: `Current prompt:\n${currentPrompt}\n\nModifications to incorporate:\n${modifications.join('\n')}\n\nCreate an improved prompt that incorporates these modifications while maintaining the core functionality.`
                }
            ],
            temperature: 0.7
        });

        const newPrompt = completion.choices[0].message.content;
        await dynamoService.updatePrompt(phoneNumber, newPrompt);
        const newUpdatedPrompt = await dynamoService.getPrompt(phoneNumber);
        logInfo('generateNewPrompt', {newUpdatedPrompt});

        logInfo('generateNewPrompt', 'Generated new prompt', { newPrompt });
        return newPrompt;
    } catch (error) {
        logInfo('generateNewPrompt', 'Error generating new prompt', { error: error.message });
        return null;
    }
};

// Function to analyze conversation for modifications
const analyzeForModifications = async (conversation) => {
    try {
        logInfo('analyzeForModifications', 'Analyzing conversation for modifications');

        const text_prompt = await dynamoServiceBussiness.getModificationAnalizer(bussinessId);
        const prompt = `\nConversación: ${conversation.map(msg => `${msg.role}: ${msg.content}`).join('\n')}${text_prompt}`; // Combina text_prompt y la conversación

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: conversation[conversation.length - 1].content }
            ],
            temperature: 0.3
        });

        return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
        logInfo('analyzeForModifications', 'Error analyzing modifications', { error: error.message });
        return { is_modification: false };
    }
};


// Function to save modification
const saveModification = async (modification) => {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const entry = `[${timestamp}] ${JSON.stringify(modification)}\n`;

    await dynamoService.saveModification(phoneNumber, modification);

   // logInfo('tiempo de respuesta modificado:', modification.delay_time);

    if(modification.delay_time) {
        writeFileSync(VARIABLES_CHAT, ''); // clear previous prompt
        appendFileSync(VARIABLES_CHAT, `{\n "delay_Time_Response": ${JSON.stringify(modification.delay_time)}\n }`);
        message_delay = modification.delay_time;
        logInfo('tiempo de respuesta actualizado:', message_delay);
    }

    const modifications = await dynamoService.getModifications(phoneNumber);
    if (modifications.length >= 3) {
        await generateNewPrompt(modifications);
        // Limpiar la lista de modificaciones en DynamoDB
        await dynamoService.clearModifications(phoneNumber);
    }
};

// Function to generate conversation response
const getNextInteraction = async (conversation) => {
    try {
        logInfo('getNextInteraction', 'Getting next bot response');

        const basePrompt = await dynamoService.getPrompt(phoneNumber);
        logInfo('CURRENT_PROMPT: ', basePrompt);
        const text_prompt = await dynamoServiceBussiness.getNextIteration(bussinessId);
        const prompt = `${basePrompt}${text_prompt}\nHistorial de la conversación: ${conversation.map(msg => `${msg.role}: ${msg.content}`).join('\n')}`; // Combina text_prompt y la conversación

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: prompt },
                ...conversation
            ],
            temperature: 0.7
        });

        return completion.choices[0].message.content;
    } catch (error) {
        logInfo('getNextInteraction', 'Error getting response', { error: error.message });
        return "Lo siento, ha ocurrido un error. ¿Podrías repetir tu mensaje?";
    }
};

// Asegúrate de que el directorio existe
if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
    console.log(`Directorio creado: ${AUDIO_DIR}`);
}


// Main flow export
export const flowTraining = addKeyword(REGEX_ANY_CHARACTER, { regex: true })
    .addAction(async (ctx, { flowDynamic, state, provider }) => {
        try {
            //const message = ctx.body;
            let isInTraining = state.get('isInTraining');

            phoneNumber = ctx.from.replace('@s.whatsapp.net', '');
            //logInfo("numero del usuario: ", phoneNumber);

            if(!dynamoDBPhonenNumbers.getPhoneId(phoneNumber)) {
                logInfo('se ha encontrado el numero en la BBDD', phoneNumber);
                //state.clear();
                return;
            }

            const message = await handleMessage(ctx, provider);

            if (!message) {
                await flowDynamic('Hubo un error al procesar el mensaje. Por favor, intenta nuevamente.');
                return;
            }

            //console.log('+'.repeat(50) + message);

            // Check if starting training
            if (!isInTraining) {
                if (message.toLowerCase() === 'entrenar') {
                    await state.update({ isInTraining: true });
                    await flowDynamic([
                        '🤖 *Modo de Entrenamiento Iniciado*',
                        '',
                        'Puedes interactuar normalmente con el bot o sugerir modificaciones.',
                        'Para salir, simplemente escribe "salir".',
                        '',
                        '¿En qué puedo ayudarte?'
                    ]);
                    //listenToGroup(ctx, provider);
                    return;
                }
                return false; // Not in training, allow other flows
            }

            // Check for exit command
            if (message.toLowerCase() === 'salir') {
                await flowDynamic([
                    '✅ Entrenamiento finalizado.',
                    'Todas las modificaciones han sido guardadas.',
                    '¡Hasta pronto!'
                ]);
                await state.clear();
                return;
            }

            // Get or initialize conversation context
            let conversation = state.get('conversation') || [];
            conversation.push({ role: 'user', content: message });

            // Analyze for modifications
            const analysis = await analyzeForModifications(conversation);

            if (analysis.is_modification) {
                logInfo('flowTraining', 'Modification detected', analysis);
                await saveModification(analysis);

                await flowDynamic([
                    '✅ He detectado una sugerencia de modificación:',
                    `Tipo: ${analysis.modification_type}`,
                    `Descripción: ${analysis.description}`,
                    '',
                    'La modificación ha sido registrada. ¿Hay algo más en lo que pueda ayudarte?'
                ]);

                conversation.push({
                    role: 'assistant',
                    content: `Modificación registrada: ${analysis.description}`
                });

                return;
            } else {
                // Normal conversation flow
                const response = await getNextInteraction(conversation);
                await flowDynamic([{
                    body:response, 
                    delay:message_delay}]);

                conversation.push({ role: 'assistant', content: response });
            }

            // Update conversation state
            await state.update({ conversation });

        } catch (error) {
            logInfo('flowTraining', 'Error in flow', { error: error.message });
            await flowDynamic('Ha ocurrido un error. Por favor, intenta de nuevo.');
        }
    });


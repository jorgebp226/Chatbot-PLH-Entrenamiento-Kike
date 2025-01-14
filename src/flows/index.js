import { flowGroupMessages } from '../utils/chats.js';
import { createGroupMessageFlow } from '../utils/groupMessageHandler.js';
import { flowTraining } from './training.js';
//import { voiceNoteFlow } from './training.js';
//import { mediaFlow } from './training.js';

export const allFlows = [
    flowTraining,
    flowGroupMessages
    //voiceNoteFlow
    //mediaFlow
];
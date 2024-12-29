import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

// Cargar las variables de entorno
dotenv.config()

export class DynamoDBServiceBussiness {
  constructor() {
    this.client = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.tableName = 'Talky_WhatsApp_ChatBots_Flow_Prompts';
  }

  // Obtener los datos actuales del usuario
  async getBussinesById(bussinessId) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        bussines_Id: bussinessId
      }
    })
    
    const response = await this.docClient.send(command);
    return response.Item || {
      bussines_Id: bussinessId,
      modifications_Analizer: '',
      next_Iteration: '',
      prompt_Trainer: ''
    }
  }

    // Obtener el analizador de modificaciones
    async getModificationAnalizer(bussinessId) {
        const data = await this.getBussinesById(bussinessId);
        return data.modifications_Analizer || '' ;
    }

    // Obtener el entrenador de prompt
    async getPromptTrainer(bussinessId) {
        const data = await this.getBussinesById(bussinessId);
        return data.prompt_Trainer || '' ;
    }

    // Obtener el next iteration prompt
    async getNextIteration(bussinessId) {
        const data = await this.getBussinesById(bussinessId);
        return data.next_Iteration || '' ;
    }
}
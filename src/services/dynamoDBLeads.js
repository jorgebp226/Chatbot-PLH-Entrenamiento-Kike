import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

// Cargar las variables de entorno
dotenv.config()

export class DynamoDBLeads {
  constructor() {
    this.client = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.tableName = 'Leads';
  }

  // Obtener los datos actuales del usuario
  async getProject(projectId) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        id: projectId
      }
    })
    
    const response = await this.docClient.send(command);
    return response.Item || {
      id: projectId,
      address: '',
      budget:'',
      Coronacion:'',
      createdAt:'',
      Interior:'',
      name:'',
      parcelDimensions:[],
      phone: '',
      poolDimensions:[],
      source:'',
      status:'',
      updatedAt:''
    }
  }

  // Guardar una nueva modificación
  async saveBudget(projectId, budget) {
    const currentData = await this.getProject(projectId);

    // Actualizamos la tabla
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        id: currentData.id
      },
      UpdateExpression: 'SET budget = :m',
      ExpressionAttributeValues: {
        ':m': budget
      }
    })

    return await this.docClient.send(command);
  }


  // Actualizar el prompt
  async updatePrompt(phoneNumber, newPrompt) {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        userId: phoneNumber
      },
      UpdateExpression: 'SET prompt = :p',
      ExpressionAttributeValues: {
        ':p': newPrompt
      }
    })

    return await this.docClient.send(command)
  }

  // Obtener las modificaciones actuales
  async getId(phoneNumber) {
    const data = await this.getUserByphone(phoneNumber);
    return data.id || [] ;
  }

  // Obtener el prompt actual
  async getPrompt(phoneNumber) {
    const data = await this.getUserByphone(phoneNumber);
    return data.prompt || '' ;
  }

  // Obtener el historial completo
  async getHistory(phoneNumber) {
    const data = await this.getUserByphone(phoneNumber);
    return data.history || [] ;
  }

  // Obtener el historial de prompts
  async getHistoryPrompt(phoneNumber) {
    const data = await this.getUserByphone(phoneNumber);
    return data.history_prompt || [] ;
  }
}
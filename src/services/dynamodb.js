import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { paginateListBuckets } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

// Cargar las variables de entorno
dotenv.config()

export class DynamoDBService {
  constructor() {
    this.client = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.tableName = 'Talky_WhatsApp_Bots_Prompts_Data_Base';
  }

  // Obtener los datos actuales del usuario
  async getUserByphone(phoneNumber) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        userId: phoneNumber
      }
    })
    
    const response = await this.docClient.send(command);
    return response.Item || {
      userId: phoneNumber,
      history: [],
      modifications: [],
      prompt: '',
      history_prompt: []
    }
  }

  // Guardar una nueva modificación
  async saveModification(phoneNumber, modification) {
    const currentData = await this.getUserByphone(phoneNumber);

    // Agregar a las modificaciones
    const modifications = [...(currentData.modifications || [])];
    modifications.unshift(modification);

    // Agregar al historial
    // Mantenemos todo el historial, sin borrarlo
    const history = [...(currentData.history || []), modification];

    // Agregar al historial el prompt
    // Mantenemos todo el historial, sin borrarlo
    const history_prompt = [...(currentData.history_prompt || []), modification];

    // Actualizamos la tabla
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        userId: phoneNumber
      },
      UpdateExpression: 'SET modifications = :m, history = list_append(if_not_exists(history, :empty_list), :h), history_prompt = list_append(if_not_exists(history_prompt, :empty_list), :y)',
      ExpressionAttributeValues: {
        ':m': modifications,
        ':h': [modification],
        ':y': [history_prompt],
        ':empty_list': []
      }
    })

    return await this.docClient.send(command);
  }

  // Limpiar la lista de modificaciones
  // (conservamos el historial para tener registro de todo)
  async clearModifications(phoneNumber) {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        userId: phoneNumber
      },
      UpdateExpression: 'SET modifications = :emptyList',
      ExpressionAttributeValues: {
        ':emptyList': []
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
  async getModifications(phoneNumber) {
    const data = await this.getUserByphone(phoneNumber);
    return data.modifications || [] ;
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
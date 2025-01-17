import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';

// Cargar las variables de entorno
dotenv.config()

export class DynamoDBPhoneNumbers {
  constructor() {
    this.client = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.docClient = DynamoDBDocumentClient.from(this.client);
    this.tableName = 'Talky_PLH_Deactivated_Phone_Numbers';
  }

  // Obtener los datos actuales del usuario
  async getUserByphone(phoneNumber) {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        phoneid: phoneNumber
      }
    })
    
    const response = await this.docClient.send(command);
    return response.Item || {
      phoneid: phoneNumber,
      nombre: '',
    }
  }

  // Obtener las modificaciones actuales
  async getPhoneId(phoneNumber) {
    const data = await this.getUserByphone(phoneNumber);
    return data.phoneid || [] ;
  }

  // Añadir un nuevo registro de teléfono
async addNewPhoneNumber(phoneNumber, name) {
    try {
      const command = new PutCommand({
        TableName: this.tableName,
        Item: {
          phoneid: phoneNumber,
          nombre: name,
          createdAt: new Date().toISOString()
        }
      });
  
      await this.docClient.send(command);
      return {
        success: true,
        message: 'Número de teléfono añadido correctamente'
      };
    } catch (error) {
      console.error('Error al añadir número de teléfono:', error);
      return {
        success: false,
        message: 'Error al añadir el número de teléfono',
        error
      };
    }
  }

}
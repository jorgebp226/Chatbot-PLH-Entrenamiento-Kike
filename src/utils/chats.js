/**
 * Función para obtener el ID de un grupo de WhatsApp por su nombre
 * @param {string} groupName - Nombre del grupo a buscar
 * @returns {string|null} - ID del grupo o null si no se encuentra
 */
const getGroupId = async (groupName, provider) => {
    try {
      // Obtener la instancia del proveedor
      const refProvider = await provider.getInstance();
      
      // Obtener todos los chats
      const chats = await refProvider.groupFetchAllParticipating();
      
      // Buscar el grupo por nombre
      for (const [id, chat] of Object.entries(chats)) {
        if (chat.subject?.toLowerCase() === groupName.toLowerCase()) {
          return id;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error al buscar el grupo:', error);
      return null;
    }
  };

  export { getGroupId };
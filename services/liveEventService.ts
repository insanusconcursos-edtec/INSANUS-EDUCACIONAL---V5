import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp, arrayUnion, arrayRemove, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import { LiveEvent, LiveEventMaterial, LiveEventChatMessage } from '../types/liveEvent';

const COLLECTION_NAME = 'live_events';

export const liveEventService = {
  getLiveEventsByPresentialClass: async (classId: string): Promise<LiveEvent[]> => {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("status", "!=", "ended")
      );
      const snapshot = await getDocs(q);
      const allActiveEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveEvent));
      
      // Filter by presential class access
      return allActiveEvents.filter(event => 
        event.accessControl?.presentialClasses?.includes(classId)
      );
    } catch (error) {
      console.error("Error fetching live events by class:", error);
      return [];
    }
  },

  getLiveEventsByOnlineCourse: async (courseId: string): Promise<LiveEvent[]> => {
    try {
      const q = query(
        collection(db, COLLECTION_NAME),
        where("status", "!=", "ended")
      );
      const snapshot = await getDocs(q);
      const allActiveEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveEvent));
      
      // Filter by online course access
      return allActiveEvents.filter(event => 
        event.accessControl?.onlineCourses?.includes(courseId)
      );
    } catch (error) {
      console.error("Error fetching live events by course:", error);
      return [];
    }
  },

  getLiveEvents: async (): Promise<LiveEvent[]> => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LiveEvent));
  },

  getLiveEventById: async (id: string): Promise<LiveEvent | null> => {
    const docRef = doc(db, COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as LiveEvent;
    }
    return null;
  },

  createLiveEvent: async (data: LiveEvent, thumbnailFile?: File): Promise<string> => {
    let thumbnailUrl = '';

    if (thumbnailFile) {
      const storageRef = ref(storage, `live_thumbnails/${Date.now()}_${thumbnailFile.name}`);
      await uploadBytes(storageRef, thumbnailFile);
      thumbnailUrl = await getDownloadURL(storageRef);
    }

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      thumbnailUrl: thumbnailUrl || data.thumbnailUrl || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return docRef.id;
  },

  updateLiveEvent: async (id: string, data: Partial<LiveEvent>, thumbnailFile?: File): Promise<void> => {
    let thumbnailUrl = data.thumbnailUrl;

    if (thumbnailFile) {
      const storageRef = ref(storage, `live_thumbnails/${Date.now()}_${thumbnailFile.name}`);
      await uploadBytes(storageRef, thumbnailFile);
      thumbnailUrl = await getDownloadURL(storageRef);
    }

    const updateData = {
      ...data,
      updatedAt: serverTimestamp()
    };

    if (thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = thumbnailUrl;
    }

    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, updateData);
  },

  deleteLiveEvent: async (id: string, thumbnailUrl?: string): Promise<void> => {
    const docRef = doc(db, COLLECTION_NAME, id);
    let finalThumbnailUrl = thumbnailUrl;
    let materials: LiveEventMaterial[] = [];

    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as LiveEvent;
        if (data.thumbnailUrl) {
          finalThumbnailUrl = data.thumbnailUrl;
        }
        if (data.materials && Array.isArray(data.materials)) {
          materials = data.materials;
        }
      }
    } catch (error) {
      console.error('Error fetching live event data before deletion:', error);
    }

    // Delete thumbnail from storage if it exists
    if (finalThumbnailUrl) {
      try {
        const fileRef = ref(storage, finalThumbnailUrl);
        await deleteObject(fileRef);
      } catch (error) {
        console.error('Error deleting thumbnail from storage:', error);
      }
    }

    // Delete all materials (PDFs, etc.) from storage if they exist
    if (materials && materials.length > 0) {
      for (const mat of materials) {
        if (mat.url) {
          try {
            const fileRef = ref(storage, mat.url);
            await deleteObject(fileRef);
          } catch (error) {
            console.error(`Error deleting material "${mat.title}" from storage:`, error);
          }
        }
      }
    }

    // Delete document
    await deleteDoc(docRef);
  },

  updateLiveEventSettings: async (eventId: string, settings: Partial<LiveEvent>): Promise<void> => {
    const docRef = doc(db, COLLECTION_NAME, eventId);
    await updateDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    });
  },

  uploadLiveMaterial: async (eventId: string, file: File, title: string): Promise<LiveEventMaterial> => {
    try {
      const storageRef = ref(storage, `live_materials/${eventId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      const material: LiveEventMaterial = {
        id: Date.now().toString(),
        title,
        url,
        order: 0
      };

      const docRef = doc(db, COLLECTION_NAME, eventId);
      await updateDoc(docRef, {
        materials: arrayUnion(material)
      });

      return material;
    } catch (error) {
      console.error("Error uploading material:", error);
      throw error;
    }
  },

  deleteLiveMaterial: async (eventId: string, materialId: string, fileUrl: string): Promise<void> => {
    try {
      // Try to delete the file from storage
      try {
        const fileRef = ref(storage, fileUrl);
        await deleteObject(fileRef);
      } catch (e) {
        console.error("Error deleting material from storage:", e);
      }

      const docRef = doc(db, COLLECTION_NAME, eventId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const eventData = docSnap.data() as LiveEvent;
        const materials = eventData.materials || [];
        const updatedMaterials = materials.filter(m => m.id !== materialId);
        
        await updateDoc(docRef, {
          materials: updatedMaterials
        });
      }
    } catch (error) {
      console.error("Error deleting material:", error);
      throw error;
    }
  },

  // Keep existing uploadMaterial/deleteMaterial for backwards compatibility if used elsewhere
  uploadMaterial: async (eventId: string, file: File, title: string): Promise<LiveEventMaterial> => {
    try {
      const storageRef = ref(storage, `live_materials/${eventId}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const material: LiveEventMaterial = {
        id: Date.now().toString(),
        title,
        url
      };

      const docRef = doc(db, COLLECTION_NAME, eventId);
      await updateDoc(docRef, {
        materials: arrayUnion(material)
      });

      return material;
    } catch (error) {
      console.error("Error uploading material:", error);
      throw error;
    }
  },

  deleteMaterial: async (eventId: string, material: LiveEventMaterial): Promise<void> => {
    try {
      // Try to delete the file from storage
      try {
        const fileRef = ref(storage, material.url);
        await deleteObject(fileRef);
      } catch (e) {
        console.error("Error deleting material from storage:", e);
      }

      const docRef = doc(db, COLLECTION_NAME, eventId);
      await updateDoc(docRef, {
        materials: arrayRemove(material)
      });
    } catch (error) {
      console.error("Error deleting material:", error);
      throw error;
    }
  },

  // --- CHAT ---
  sendChatMessage: async (eventId: string, messageData: Omit<LiveEventChatMessage, 'id' | 'eventId' | 'createdAt'>): Promise<string> => {
    try {
      const chatRef = collection(db, COLLECTION_NAME, eventId, 'chat_messages');
      const docRef = await addDoc(chatRef, {
        ...messageData,
        eventId,
        createdAt: serverTimestamp(),
        isDeleted: false
      });
      return docRef.id;
    } catch (error) {
      console.error("Error sending chat message:", error);
      throw error;
    }
  },

  deleteChatMessage: async (eventId: string, messageId: string): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, eventId, 'chat_messages', messageId);
      await updateDoc(docRef, {
        isDeleted: true,
        text: 'Mensagem apagada pelo moderador.'
      });
    } catch (error) {
      console.error("Error deleting chat message:", error);
      throw error;
    }
  },

  startLiveEvent: async (eventId: string): Promise<void> => {
    const docRef = doc(db, COLLECTION_NAME, eventId);
    await updateDoc(docRef, { status: 'live' });
  },

  endLiveEvent: async (eventId: string): Promise<void> => {
    const docRef = doc(db, COLLECTION_NAME, eventId);
    await updateDoc(docRef, { status: 'ended' });
  }
};

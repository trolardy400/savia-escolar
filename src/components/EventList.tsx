/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, getDocs, where, writeBatch, deleteDoc, doc, updateDoc, getDoc, or, arrayUnion } from 'firebase/firestore';
import { Event, Student } from '../types';
import { Calendar, Plus, ChevronRight, Clock, CheckCircle2, AlertCircle, Trash2, MoreVertical, Users, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { PaymentManager } from './PaymentManager';

const CollaboratorList = ({ ownerId, collaborators }: { ownerId: string, collaborators: string[] }) => {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    const fetchNames = async () => {
      const uids = [ownerId, ...(collaborators || [])];
      const fetchedNames: string[] = [];
      for (const uid of uids) {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            fetchedNames.push(userDoc.data().displayName || 'Usuario');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${uid}`);
        }
      }
      setNames(fetchedNames);
    };
    fetchNames();
  }, [ownerId, collaborators]);

  if (names.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-2">
      <Users className="w-3 h-3 text-sage-400" />
      <p className="text-[10px] text-sage-500 dark:text-sage-400">
        <span className="font-bold">Colaboradores:</span> {names.join(', ')}
      </p>
    </div>
  );
};

export const EventList = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const [newEvent, setNewEvent] = useState({ 
    name: '', 
    date: '', 
    startDate: '', 
    endDate: '', 
    totalAmount: 0, 
    installments: 1 
  });
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'events'),
      or(
        where('ownerId', '==', auth.currentUser.uid),
        where('collaborators', 'array-contains', auth.currentUser.uid)
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event));
      // Sort by date desc client-side to avoid index requirements for now
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
    });

    const fetchCurrency = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const prefs = userDoc.data().preferences;
          const currencyCode = prefs?.currency || 'CLP';
          const symbols: Record<string, string> = {
            'CLP': '$', 'USD': '$', 'EUR': '€', 'ARS': '$', 'MXN': '$', 'BRL': 'R$', 'BOB': 'Bs'
          };
          setCurrencySymbol(symbols[currencyCode] || '$');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}`);
      }
    };
    fetchCurrency();

    return unsubscribe;
  }, []);

  const handleShare = (eventId: string) => {
    navigator.clipboard.writeText(eventId);
    setShowCopyAlert(true);
    setTimeout(() => setShowCopyAlert(false), 2000);
    setActiveMenu(null);
  };

  const handleDeleteEvent = async () => {
    if (!confirmDeleteId) return;
    try {
      const eventToDelete = events.find(e => e.id === confirmDeleteId);
      if (eventToDelete) {
        // Update all students to remove the debt from this event
        const studentsSnap = await getDocs(collection(db, 'students'));
        const batch = writeBatch(db);
        
        studentsSnap.docs.forEach(studentDoc => {
          const studentData = studentDoc.data() as Student;
          const currentDebt = studentData.debt || 0;
          // We assume the student was charged the full amount. 
          // This is a simplification, but matches the creation logic.
          batch.update(studentDoc.ref, {
            debt: Math.max(0, currentDebt - eventToDelete.totalAmount)
          });
        });
        
        await batch.commit();
      }

      await deleteDoc(doc(db, 'events', confirmDeleteId));
      setConfirmDeleteId(null);
      setActiveMenu(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${confirmDeleteId}`);
    }
  };

  const handleEditEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;
    try {
      await updateDoc(doc(db, 'events', editingEvent.id), {
        name: editingEvent.name,
        date: editingEvent.date,
        startDate: editingEvent.startDate,
        endDate: editingEvent.endDate,
        totalAmount: editingEvent.totalAmount,
        installments: editingEvent.installments,
        status: editingEvent.status
      });
      setIsEditModalOpen(false);
      setActiveMenu(null);
      setEditingEvent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${editingEvent.id}`);
    }
  };

  const handleJoinEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (!auth.currentUser) return;
    if (!joinCode.trim()) return;

    try {
      const eventRef = doc(db, 'events', joinCode.trim());
      const eventDoc = await getDoc(eventRef);
      
      if (!eventDoc.exists()) {
        setJoinError('Código de evento no válido.');
        return;
      }

      const eventData = eventDoc.data() as Event;
      if (eventData.ownerId === auth.currentUser.uid || eventData.collaborators?.includes(auth.currentUser.uid)) {
        setJoinError('Ya eres parte de este evento.');
        return;
      }

      await updateDoc(eventRef, {
        collaborators: arrayUnion(auth.currentUser.uid)
      });

      setIsJoinModalOpen(false);
      setJoinCode('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${joinCode.trim()}`);
      setJoinError('Error al unirse al evento. Verifica el código.');
    }
  };

  if (selectedEvent) {
    return <PaymentManager event={selectedEvent} onBack={() => setSelectedEvent(null)} />;
  }

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      // 1. Create Google Spreadsheet via GAS
      let spreadsheetUrl = '';
      let spreadsheetId = '';
      const gasUrl = 'https://script.google.com/macros/s/AKfycbyBmpI83PblVDOHJ7SdaDVH6kqHNy65spU4HMnYH1LT9jYkJdNYaY2BWQradKJGkgeg/exec';

      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'createSpreadsheet',
            eventName: newEvent.name,
            installments: newEvent.installments
          })
        });
        const data = await res.json();
        spreadsheetUrl = data.spreadsheetUrl;
        spreadsheetId = data.spreadsheetId;
      } catch (err) {
        console.error("Error creating Google Sheet:", err);
      }

      // 2. Create the event in Firestore
      const eventRef = await addDoc(collection(db, 'events'), {
        ...newEvent,
        status: 'upcoming',
        collected: 0,
        spreadsheetUrl,
        spreadsheetId,
        ownerId: auth.currentUser?.uid,
        collaborators: [],
        createdAt: new Date().toISOString()
      });

      // Mark all active students as debtors for this event initially
      // We'll update their total debt in Firestore
      const studentsSnap = await getDocs(query(collection(db, 'students'), where('status', '==', 'active')));
      const batch = writeBatch(db);
      
      studentsSnap.docs.forEach(studentDoc => {
        const studentData = studentDoc.data() as Student;
        const currentDebt = studentData.debt || 0;
        batch.update(studentDoc.ref, {
          debt: currentDebt + newEvent.totalAmount
        });
      });
      
      await batch.commit();

      setIsModalOpen(false);
      setActiveMenu(null);
      setNewEvent({ name: '', date: '', startDate: '', endDate: '', totalAmount: 0, installments: 1 });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <AnimatePresence>
        {showCopyAlert && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-forest-600 text-white px-6 py-3 rounded-2xl shadow-xl font-bold flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            ID copiado al portapapeles
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-forest-700 dark:text-forest-300">Gestión de Eventos</h2>
          <p className="text-sage-500 dark:text-sage-300">Controla la contabilidad y recaudación de actividades escolares.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setIsJoinModalOpen(true)} className="btn-secondary">
            <Users className="w-5 h-5" />
            Colaborar
          </button>
          <button onClick={() => setIsModalOpen(true)} className="btn-primary">
            <Plus className="w-5 h-5" />
            Crear Evento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {events.map((event) => (
          <motion.div 
            key={event.id}
            whileHover={{ y: -5 }}
            className="glass-card p-6 flex flex-col h-full"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${
                  event.status === 'active' ? 'bg-emerald-100 text-emerald-600' : 
                  event.status === 'upcoming' ? 'bg-blue-100 text-blue-600' : 'bg-sage-100 text-sage-600'
                }`}>
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenu(activeMenu === event.id ? null : event.id)}
                    className="p-2 text-sage-400 hover:text-forest-600 dark:hover:text-forest-400 rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  
                  <AnimatePresence>
                    {activeMenu === event.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setActiveMenu(null)} 
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-sage-800 rounded-xl shadow-2xl border border-sage-100 dark:border-sage-700 z-50 py-2 overflow-hidden"
                        >
                          <button 
                            onClick={() => handleShare(event.id)}
                            className="w-full px-4 py-2 text-left text-sm text-sage-700 dark:text-sage-200 hover:bg-sage-50 dark:hover:bg-sage-700 flex items-center gap-2"
                          >
                            <Share2 className="w-4 h-4" />
                            Compartir (Copiar ID)
                          </button>
                          <button 
                            onClick={() => {
                              setEditingEvent(event);
                              setIsEditModalOpen(true);
                              setActiveMenu(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-sage-700 dark:text-sage-200 hover:bg-sage-50 dark:hover:bg-sage-700 flex items-center gap-2"
                          >
                            <Calendar className="w-4 h-4" />
                            Editar Evento
                          </button>
                          <button 
                            onClick={() => {
                              setConfirmDeleteId(event.id);
                              setActiveMenu(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Eliminar Evento
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                event.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 
                event.status === 'upcoming' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-sage-50 text-sage-700 dark:bg-sage-800 dark:text-sage-300'
              }`}>
                {event.status === 'active' ? 'Activo' : event.status === 'upcoming' ? 'Próximo' : 'Finalizado'}
              </span>
            </div>

            <h3 className="text-xl font-bold text-sage-900 dark:text-sage-100 mb-1">{event.name}</h3>
            <CollaboratorList ownerId={event.ownerId} collaborators={event.collaborators} />
            <div className="space-y-2 mb-6">
              <p className="text-sm text-sage-500 dark:text-sage-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Evento: {event.date ? format(new Date(event.date), "d 'de' MMM", { locale: es }) : 'Sin fecha'}
              </p>
              <div className="flex items-center justify-between text-[10px] text-sage-400 bg-sage-50 dark:bg-sage-800/50 p-2 rounded-lg">
                <span>Inicio: {event.startDate ? format(new Date(event.startDate), "d/MM/yy") : '--/--/--'}</span>
                <span>Límite: {event.endDate ? format(new Date(event.endDate), "d/MM/yy") : '--/--/--'}</span>
              </div>
            </div>

            <div className="mt-auto space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-sage-500 dark:text-sage-400">Progreso de Recaudación</span>
                  <span className="font-bold text-sage-900 dark:text-sage-100">{Math.round(((event.collected || 0) / event.totalAmount) * 100)}%</span>
                </div>
                <div className="h-2 bg-sage-100 dark:bg-sage-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${((event.collected || 0) / event.totalAmount) * 100}%` }}
                    className="h-full bg-forest-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-sage-100 dark:border-sage-800">
                <div>
                  <p className="text-xs text-sage-400">Meta Total</p>
                  <p className="font-bold text-sage-900 dark:text-sage-100">{currencySymbol}{event.totalAmount}</p>
                </div>
                <button 
                  onClick={() => setSelectedEvent(event)}
                  className="text-forest-600 dark:text-forest-400 hover:text-forest-700 dark:hover:text-forest-300 font-medium flex items-center gap-1 group"
                >
                  Gestionar
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
        
        {events.length === 0 && (
          <div className="col-span-full py-20 text-center glass-card">
            <Calendar className="w-12 h-12 text-sage-200 dark:text-sage-800 mx-auto mb-4" />
            <p className="text-sage-400 dark:text-sage-500">No hay eventos registrados aún.</p>
          </div>
        )}
      </div>

      {/* Edit Event Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingEvent && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-card p-8"
            >
              <h3 className="text-2xl font-serif font-bold text-forest-700 dark:text-forest-300 mb-6">Editar Evento</h3>
              <form onSubmit={handleEditEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Nombre del Evento</label>
                  <input 
                    type="text" 
                    required 
                    className="input-field"
                    value={editingEvent.name}
                    onChange={(e) => setEditingEvent({ ...editingEvent, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Fecha del Evento</label>
                    <input 
                      type="date" 
                      required 
                      className="input-field"
                      value={editingEvent.date}
                      onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Estado</label>
                    <select 
                      className="input-field"
                      value={editingEvent.status}
                      onChange={(e) => setEditingEvent({ ...editingEvent, status: e.target.value as 'active' | 'upcoming' | 'completed' })}
                    >
                      <option value="active">Activo</option>
                      <option value="upcoming">Próximo</option>
                      <option value="completed">Finalizado</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Inicio Recaudación</label>
                    <input 
                      type="date" 
                      required 
                      className="input-field"
                      value={editingEvent.startDate}
                      onChange={(e) => setEditingEvent({ ...editingEvent, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Límite Recaudación</label>
                    <input 
                      type="date" 
                      required 
                      className="input-field"
                      value={editingEvent.endDate}
                      onChange={(e) => setEditingEvent({ ...editingEvent, endDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Monto Total ({currencySymbol})</label>
                    <input 
                      type="number" 
                      required 
                      className="input-field"
                      value={editingEvent.totalAmount}
                      onChange={(e) => setEditingEvent({ ...editingEvent, totalAmount: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Cuotas</label>
                    <input 
                      type="number" 
                      required 
                      min="1"
                      className="input-field"
                      value={editingEvent.installments}
                      onChange={(e) => setEditingEvent({ ...editingEvent, installments: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingEvent(null);
                    }}
                    className="btn-secondary flex-1"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary flex-1">
                    Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm glass-card p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-serif font-bold text-sage-900 dark:text-sage-100 mb-2">¿Eliminar Evento?</h3>
              <p className="text-sage-500 dark:text-sage-400 text-sm mb-8">
                Esta acción es permanente y eliminará todos los registros de recaudación asociados a este evento.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteEvent}
                  className="bg-rose-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 dark:shadow-sage-950 flex-1"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-card p-8"
            >
              <h3 className="text-2xl font-serif font-bold text-forest-700 dark:text-forest-300 mb-6">Nuevo Evento</h3>
              <form onSubmit={handleAddEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Nombre del Evento</label>
                  <input 
                    required
                    type="text" 
                    className="input-field"
                    value={newEvent.name}
                    onChange={(e) => setNewEvent({...newEvent, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Fecha del Evento</label>
                  <input 
                    required
                    type="date" 
                    className="input-field"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Inicio Recaudación</label>
                    <input 
                      required
                      type="date" 
                      className="input-field text-xs"
                      value={newEvent.startDate}
                      onChange={(e) => setNewEvent({...newEvent, startDate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Límite Recaudación</label>
                    <input 
                      required
                      type="date" 
                      className="input-field text-xs"
                      value={newEvent.endDate}
                      onChange={(e) => setNewEvent({...newEvent, endDate: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Monto Total ({currencySymbol})</label>
                    <input 
                      required
                      type="number" 
                      className="input-field"
                      value={newEvent.totalAmount === 0 ? '' : newEvent.totalAmount}
                      onChange={(e) => setNewEvent({...newEvent, totalAmount: Number(e.target.value)})}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Cuotas</label>
                    <input 
                      required
                      type="number" 
                      min="1"
                      className="input-field"
                      value={newEvent.installments}
                      onChange={(e) => setNewEvent({...newEvent, installments: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary flex-1" disabled={isCreating}>Cancelar</button>
                  <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={isCreating}>
                    {isCreating ? (
                      <>
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                        />
                        Creando...
                      </>
                    ) : 'Crear'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Join Event Modal */}
      <AnimatePresence>
        {isJoinModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-card p-8"
            >
              <h3 className="text-2xl font-serif font-bold text-forest-700 dark:text-forest-300 mb-6">Colaborar en Evento</h3>
              <p className="text-sm text-sage-600 dark:text-sage-400 mb-6">Introduce el código del evento para unirte a la colaboración.</p>
              
              <form onSubmit={handleJoinEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Código de Evento de Colaboración</label>
                  <input 
                    required
                    type="text" 
                    className="input-field"
                    placeholder="Pega el ID del evento aquí"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                  {joinError && <p className="text-xs text-red-500 mt-1">{joinError}</p>}
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsJoinModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" className="btn-primary flex-1">Unirse</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { Student } from '../types';
import { Search, Plus, Filter, MoreVertical, UserPlus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const StudentList = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newStudent, setNewStudent] = useState({ name: '', grade: '', parentEmail: '' });
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  useEffect(() => {
    const q = query(collection(db, 'students'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
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

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'students'), {
        ...newStudent,
        status: 'active',
        debt: 0,
        createdAt: new Date().toISOString()
      });
      setIsModalOpen(false);
      setActiveMenu(null);
      setNewStudent({ name: '', grade: '', parentEmail: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'students');
    }
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      await updateDoc(doc(db, 'students', editingStudent.id), {
        name: editingStudent.name,
        grade: editingStudent.grade,
        parentEmail: editingStudent.parentEmail || '',
        status: editingStudent.status
      });
      setIsEditModalOpen(false);
      setActiveMenu(null);
      setEditingStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${editingStudent.id}`);
    }
  };

  const handleDeleteStudent = async () => {
    if (!confirmDeleteId) return;
    try {
      await deleteDoc(doc(db, 'students', confirmDeleteId));
      setConfirmDeleteId(null);
      setActiveMenu(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${confirmDeleteId}`);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.grade.toLowerCase().includes(searchTerm.toLowerCase())
  );  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-forest-700 dark:text-forest-300">Directorio de Estudiantes</h2>
          <p className="text-sage-500 dark:text-sage-300">Gestiona la información y el estado de cuenta de los alumnos.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <UserPlus className="w-5 h-5" />
          Agregar Estudiante
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar por nombre o grado..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <button className="btn-secondary">
          <Filter className="w-5 h-5" />
          Filtros
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-sage-50 dark:bg-sage-800 text-sage-500 dark:text-sage-400 text-sm font-medium border-b border-sage-100 dark:border-sage-700">
                <th className="px-6 py-4">Estudiante</th>
                <th className="px-6 py-4">Grado</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4">Deuda</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-100 dark:divide-sage-800">
              {filteredStudents.map((student) => (
                <tr key={student.id} className="hover:bg-sage-50/50 dark:hover:bg-sage-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-sage-200 dark:bg-sage-800 rounded-full flex items-center justify-center font-bold text-sage-600 dark:text-sage-400">
                        {student.name.charAt(0)}
                      </div>
                      <span className="font-medium text-sage-900 dark:text-sage-100">{student.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sage-600 dark:text-sage-400">{student.grade}</td>
                  <td className="px-6 py-4 text-sage-500 dark:text-sage-500 text-sm">{student.parentEmail}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      student.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-sage-200 text-sage-600 dark:bg-sage-800 dark:text-sage-400'
                    }`}>
                      {student.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-bold ${student.debt && student.debt > 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {currencySymbol}{student.debt || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right relative">
                    <button 
                      onClick={() => setActiveMenu(activeMenu === student.id ? null : student.id)}
                      className="p-2 text-sage-400 hover:text-forest-600 dark:hover:text-forest-400 rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    <AnimatePresence>
                      {activeMenu === student.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setActiveMenu(null)} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute right-6 bottom-full mb-2 w-48 bg-white dark:bg-sage-800 rounded-xl shadow-2xl border border-sage-100 dark:border-sage-700 z-50 py-2 overflow-hidden"
                          >
                            <button 
                              onClick={() => {
                                setEditingStudent(student);
                                setIsEditModalOpen(true);
                                setActiveMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-sage-700 dark:text-sage-200 hover:bg-sage-50 dark:hover:bg-sage-700 flex items-center gap-2"
                            >
                              <UserPlus className="w-4 h-4" />
                              Editar Estudiante
                            </button>
                            <button 
                              onClick={() => {
                                setConfirmDeleteId(student.id);
                                setActiveMenu(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Eliminar Estudiante
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sage-400 dark:text-sage-500">
                    No se encontraron estudiantes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              <h3 className="text-xl font-serif font-bold text-sage-900 dark:text-sage-100 mb-2">¿Eliminar Estudiante?</h3>
              <p className="text-sage-500 dark:text-sage-400 text-sm mb-8">
                Esta acción es permanente y eliminará todos los registros asociados a este estudiante.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDeleteId(null)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteStudent}
                  className="bg-rose-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 dark:shadow-sage-950 flex-1"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Student Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingStudent && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-card p-8"
            >
              <h3 className="text-2xl font-serif font-bold text-forest-700 dark:text-forest-300 mb-6">Editar Estudiante</h3>
              <form onSubmit={handleEditStudent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Nombre Completo</label>
                  <input 
                    type="text" 
                    required 
                    className="input-field"
                    value={editingStudent.name}
                    onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Grado/Curso</label>
                  <input 
                    type="text" 
                    required 
                    className="input-field"
                    value={editingStudent.grade}
                    onChange={(e) => setEditingStudent({ ...editingStudent, grade: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Email del Padre/Tutor (Opcional)</label>
                  <input 
                    type="email" 
                    className="input-field"
                    value={editingStudent.parentEmail}
                    onChange={(e) => setEditingStudent({ ...editingStudent, parentEmail: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Estado</label>
                  <select 
                    className="input-field"
                    value={editingStudent.status}
                    onChange={(e) => setEditingStudent({ ...editingStudent, status: e.target.value as 'active' | 'inactive' })}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingStudent(null);
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

      {/* Add Student Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-card p-8"
            >
              <h3 className="text-2xl font-serif font-bold text-forest-700 dark:text-forest-300 mb-6">Nuevo Estudiante</h3>
              <form onSubmit={handleAddStudent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Nombre Completo</label>
                  <input 
                    required
                    type="text" 
                    className="input-field"
                    value={newStudent.name}
                    onChange={(e) => setNewStudent({...newStudent, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Grado / Sección</label>
                  <input 
                    required
                    type="text" 
                    className="input-field"
                    value={newStudent.grade}
                    onChange={(e) => setNewStudent({...newStudent, grade: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Email del Padre/Tutor (Opcional)</label>
                  <input 
                    type="email" 
                    className="input-field"
                    value={newStudent.parentEmail}
                    onChange={(e) => setNewStudent({...newStudent, parentEmail: e.target.value})}
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" className="btn-primary flex-1">Guardar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

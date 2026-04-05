import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { Student, Event, Payment } from '../types';
import { Search, Filter, AlertCircle, Calendar, ChevronRight, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const DebtorList = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [debtors, setDebtors] = useState<{ student: Student, totalDebt: number, breakdown: { eventName: string, amount: number }[] }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [loading, setLoading] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  useEffect(() => {
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

    // Fetch events first
    const eventsUnsub = onSnapshot(collection(db, 'events'), (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
    });

    // Fetch students
    const studentsUnsub = onSnapshot(collection(db, 'students'), async (snapshot) => {
      const studentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      setStudents(studentData);
      
      let allEvents: Event[] = [];
      try {
        allEvents = snapshot.docs.length > 0 ? (await getDocs(collection(db, 'events'))).docs.map(d => ({ id: d.id, ...d.data() } as Event)) : [];
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'events');
      }

      const debtorsList = await Promise.all(
        studentData
          .filter(s => (s.debt || 0) > 0)
          .map(async (student) => {
            const breakdown: { eventName: string, amount: number }[] = [];
            for (const event of allEvents) {
              try {
                const paymentsSnap = await getDocs(
                  query(
                    collection(db, `events/${event.id}/payments`),
                    where('studentId', '==', student.id),
                    where('status', '==', 'paid')
                  )
                );
                const paidForEvent = paymentsSnap.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
                const eventDebt = Math.max(0, event.totalAmount - paidForEvent);
                if (eventDebt > 0) {
                  breakdown.push({ eventName: event.name, amount: eventDebt });
                }
              } catch (error) {
                handleFirestoreError(error, OperationType.LIST, `events/${event.id}/payments`);
              }
            }
            return { student, totalDebt: student.debt || 0, breakdown };
          })
      );

      setDebtors(debtorsList.sort((a, b) => b.totalDebt - a.totalDebt));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    return () => {
      eventsUnsub();
      studentsUnsub();
    };
  }, []);

  const filteredDebtors = debtors.filter(d => {
    const matchesSearch = d.student.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrade = selectedGrade === 'all' || d.student.grade === selectedGrade;
    return matchesSearch && matchesGrade;
  });

  const grades = Array.from(new Set(students.map(s => s.grade))).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-forest-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif font-bold text-forest-700 dark:text-forest-300">Lista de Deudores</h2>
        <p className="text-sage-500 dark:text-sage-300">Listado completo de estudiantes con saldos pendientes por evento.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar por nombre..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="relative w-full sm:w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-400 w-5 h-5" />
          <select 
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="input-field pl-10 appearance-none"
          >
            <option value="all">Todos los grados</option>
            {grades.map(grade => (
              <option key={grade} value={grade}>{grade}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredDebtors.map((debtor) => (
          <motion.div 
            key={debtor.student.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-sage-200 dark:bg-sage-800 rounded-full flex items-center justify-center font-bold text-sage-600 dark:text-sage-400 text-lg">
                  {debtor.student.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-sage-900 dark:text-sage-100">{debtor.student.name}</h3>
                  <p className="text-sm text-sage-500 dark:text-sage-400">{debtor.student.grade}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-rose-500">{currencySymbol}{debtor.totalDebt}</p>
                <p className="text-[10px] text-sage-400 dark:text-sage-500 uppercase tracking-wider">Deuda Total</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-sage-400 dark:text-sage-500 uppercase tracking-wider">Desglose por Evento</p>
              <div className="space-y-2">
                {debtor.breakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-sage-50 dark:bg-sage-800 rounded-xl border border-sage-100 dark:border-sage-700">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-sage-400" />
                      <span className="text-sm font-medium text-sage-700 dark:text-sage-200">{item.eventName}</span>
                    </div>
                    <span className="text-sm font-bold text-rose-600">{currencySymbol}{item.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}

        {filteredDebtors.length === 0 && (
          <div className="col-span-full py-20 text-center glass-card">
            <AlertCircle className="w-12 h-12 text-sage-200 dark:text-sage-800 mx-auto mb-4" />
            <p className="text-sage-400 dark:text-sage-500">No se encontraron deudores con los filtros aplicados.</p>
          </div>
        )}
      </div>
    </div>
  );
};

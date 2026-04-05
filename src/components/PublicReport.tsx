import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { Event, Student, Payment } from '../types';
import { Leaf, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const PublicReport = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState('$');

  useEffect(() => {
    if (!eventId) return;

    const fetchCurrency = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        if (!usersSnap.empty) {
          const prefs = usersSnap.docs[0].data().preferences;
          const currencyCode = prefs?.currency || 'CLP';
          const symbols: Record<string, string> = {
            'CLP': '$', 'USD': '$', 'EUR': '€', 'ARS': '$', 'MXN': '$', 'BRL': 'R$', 'BOB': 'Bs'
          };
          setCurrencySymbol(symbols[currencyCode] || '$');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    };
    fetchCurrency();

    const eventUnsub = onSnapshot(doc(db, 'events', eventId), (doc) => {
      if (doc.exists()) setEvent({ id: doc.id, ...doc.data() } as Event);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `events/${eventId}`);
    });

    const studentsUnsub = onSnapshot(query(collection(db, 'students'), where('status', '==', 'active')), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    const paymentsUnsub = onSnapshot(collection(db, `events/${eventId}/payments`), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `events/${eventId}/payments`);
    });

    return () => {
      eventUnsub();
      studentsUnsub();
      paymentsUnsub();
    };
  }, [eventId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-sage-50"><Leaf className="animate-spin text-forest-600 w-10 h-10" /></div>;
  if (!event) return <div className="min-h-screen flex items-center justify-center bg-sage-50 text-sage-500 font-serif text-2xl">Evento no encontrado</div>;

  return (
    <div className="min-h-screen bg-sage-50 p-6 md:p-12 transition-colors duration-300">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-forest-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-forest-100">
            <Leaf className="text-white w-10 h-10" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-forest-700">Savia Escolar</h1>
          <div className="glass-card p-6 inline-block">
            <h2 className="text-2xl font-bold text-sage-900">{event.name}</h2>
            <p className="text-sage-500 flex items-center justify-center gap-2 mt-1">
              <Calendar className="w-4 h-4" />
              {event.date ? format(new Date(event.date), "d 'de' MMMM, yyyy", { locale: es }) : 'Sin fecha'}
            </p>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="p-6 bg-forest-600 text-white flex justify-between items-center">
            <h3 className="font-bold text-lg">Estado de Recaudación Online</h3>
            <div className="text-right">
              <p className="text-xs opacity-80 uppercase tracking-wider">Progreso Total</p>
              <p className="text-2xl font-bold">
                {event.totalAmount > 0 ? Math.round(((event.collected || 0) / event.totalAmount) * 100) : 0}%
              </p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-sage-100 text-sage-600 text-xs font-bold uppercase tracking-wider border-b border-sage-200">
                  <th className="px-6 py-4 sticky left-0 bg-sage-100 z-10">Estudiante</th>
                  {Array.from({ length: event.installments }).map((_, i) => (
                    <th key={i} className="px-6 py-4 text-center">Cuota {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sage-100">
                {students.map((student) => (
                  <tr key={student.id} className="hover:bg-sage-50/50 transition-colors">
                    <td className="px-6 py-4 sticky left-0 bg-white z-10 font-medium text-sage-900">
                      {student.name}
                      <p className="text-[10px] text-sage-400 font-normal">{student.grade}</p>
                    </td>
                    {Array.from({ length: event.installments }).map((_, i) => {
                      const installmentNum = i + 1;
                      const installmentAmount = event.totalAmount / event.installments;
                      const totalPaid = payments
                        .filter(p => p.studentId === student.id && p.installmentNumber === installmentNum && p.status === 'paid')
                        .reduce((acc, p) => acc + p.amount, 0);
                      
                      const isFullyPaid = totalPaid >= (installmentAmount - 0.01);
                      const isPartiallyPaid = totalPaid > 0 && !isFullyPaid;

                      return (
                        <td key={i} className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            {isFullyPaid ? (
                              <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shadow-sm shadow-emerald-50">
                                <CheckCircle2 className="w-6 h-6" />
                              </div>
                            ) : isPartiallyPaid ? (
                              <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex flex-col items-center justify-center shadow-sm shadow-amber-50">
                                <span className="text-[10px] font-bold leading-none mb-0.5">{currencySymbol}{totalPaid}</span>
                                <Clock className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 bg-sage-50 text-sage-300 rounded-xl flex items-center justify-center border border-dashed border-sage-200">
                                <Clock className="w-5 h-5" />
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-sage-400 text-sm">
          Este es un reporte informativo en tiempo real. Para dudas o aclaraciones, contacte a la administración escolar.
        </p>
      </div>
    </div>
  );
};

/// <reference types="vite/client" />
import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, getDocs, getDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { Event, Student, Payment } from '../types';
import { ArrowLeft, Download, Share2, CheckCircle2, XCircle, Clock, AlertCircle, Save, ChevronRight, FileSpreadsheet, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PaymentManagerProps {
  event: Event;
  onBack: () => void;
}

export const PaymentManager = ({ event, onBack }: PaymentManagerProps) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<{ student: Student, installment: number } | null>(null);
  const [paymentModalType, setPaymentModalType] = useState<'options' | 'custom'>('options');
  const [customPayment, setCustomPayment] = useState({ amount: 0, date: new Date().toISOString().split('T')[0] });

  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [showHistory, setShowHistory] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [collaboratorNames, setCollaboratorNames] = useState<string[]>([]);

  useEffect(() => {
    const fetchStudents = async () => {
      const q = query(collection(db, 'students'), where('status', '==', 'active'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'students');
      });
      return unsubscribe;
    };

    const fetchPayments = async () => {
      const q = query(collection(db, `events/${event.id}/payments`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `events/${event.id}/payments`);
      });
      return unsubscribe;
    };

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

    const fetchCollaborators = async () => {
      const uids = [event.ownerId, ...(event.collaborators || [])];
      const names: string[] = [];
      for (const uid of uids) {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            names.push(userDoc.data().displayName || 'Usuario');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${uid}`);
        }
      }
      setCollaboratorNames(names);
    };

    fetchStudents();
    fetchPayments();
    fetchCurrency();
    fetchCollaborators();
  }, [event.id, event.ownerId, event.collaborators]);

  const getInstallmentTotal = (studentId: string, installment: number) => {
    return payments
      .filter(p => p.studentId === studentId && p.installmentNumber === installment)
      .reduce((acc, p) => acc + p.amount, 0);
  };

  const getInstallmentPayments = (studentId: string, installment: number) => {
    return payments.filter(p => p.studentId === studentId && p.installmentNumber === installment);
  };

  const syncToGoogleSheets = async (currentPayments: Payment[]) => {
    const gasUrl = 'https://script.google.com/macros/s/AKfycbyBmpI83PblVDOHJ7SdaDVH6kqHNy65spU4HMnYH1LT9jYkJdNYaY2BWQradKJGkgeg/exec';
    if (!event.spreadsheetId) return;

    setIsSyncing(true);
    const data = students.map(student => {
      const studentPayments = currentPayments.filter(p => p.studentId === student.id && p.status === 'paid');
      const studentTotalPaid = studentPayments.reduce((acc, p) => acc + p.amount, 0);
      const progress = event.totalAmount > 0 ? Math.round(Math.min(100, (studentTotalPaid / event.totalAmount) * 100)) : 0;
      
      const installmentStatuses = Array.from({ length: event.installments }).map((_, i) => {
        const installmentNum = i + 1;
        const totalPaid = studentPayments
          .filter(p => p.installmentNumber === installmentNum)
          .reduce((acc, p) => acc + p.amount, 0);
        const installmentAmount = event.totalAmount / event.installments;
        return totalPaid >= (installmentAmount - 0.01) ? 'PAGADO' : totalPaid > 0 ? `ABONADO (${currencySymbol}${totalPaid})` : 'PENDIENTE';
      });

      return [student.name, student.grade, ...installmentStatuses, `${progress}%`];
    });

    try {
      await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'syncData',
          spreadsheetId: event.spreadsheetId,
          data
        })
      });
    } catch (err) {
      console.error("Error syncing to Google Sheets:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const processPayment = async (studentId: string, installment: number, amount: number, date: string) => {
    const paymentsRef = collection(db, `events/${event.id}/payments`);
    
    const newPayment = {
      studentId,
      eventId: event.id,
      installmentNumber: installment,
      amount,
      date,
      status: 'paid'
    };

    try {
      await addDoc(paymentsRef, newPayment);

      // Update student debt
      const studentRef = doc(db, 'students', studentId);
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        const currentDebt = studentSnap.data().debt || 0;
        await updateDoc(studentRef, {
          debt: Math.max(0, currentDebt - amount)
        });
      }

      // Update event collected amount
      const allPaymentsSnap = await getDocs(paymentsRef);
      const allPayments = allPaymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
      const totalPaid = allPayments.reduce((acc, p) => {
        return p.status === 'paid' ? acc + Number(p.amount) : acc;
      }, 0);
      
      await updateDoc(doc(db, 'events', event.id), {
        collected: totalPaid
      });

      // Sync to Google Sheets
      await syncToGoogleSheets(allPayments);

      setSelectedPayment(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `events/${event.id}/payments`);
    }
  };

  const handleDeletePayment = async (paymentId: string, studentId: string, amount: number) => {
    if (!confirm('¿Estás seguro de eliminar este pago?')) return;
    
    try {
      await deleteDoc(doc(db, `events/${event.id}/payments`, paymentId));

      // Update student debt (increase it because payment is removed)
      const studentRef = doc(db, 'students', studentId);
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        const currentDebt = studentSnap.data().debt || 0;
        await updateDoc(studentRef, {
          debt: currentDebt + amount
        });
      }

      // Update event collected amount
      const paymentsRef = collection(db, `events/${event.id}/payments`);
      const allPaymentsSnap = await getDocs(paymentsRef);
      const allPayments = allPaymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
      const totalPaid = allPayments.reduce((acc, p) => {
        return p.status === 'paid' ? acc + Number(p.amount) : acc;
      }, 0);
      
      await updateDoc(doc(db, 'events', event.id), {
        collected: totalPaid
      });

      // Sync to Google Sheets
      await syncToGoogleSheets(allPayments);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${event.id}/payments/${paymentId}`);
    }
  };

  const handleFullPayment = async (student: Student, installment: number) => {
    const installmentAmount = event.totalAmount / event.installments;
    const currentPaid = getInstallmentTotal(student.id, installment);
    const remaining = Math.max(0, installmentAmount - currentPaid);
    if (remaining > 0) {
      await processPayment(student.id, installment, remaining, new Date().toISOString());
    }
  };

  const handleCustomPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    await processPayment(selectedPayment.student.id, selectedPayment.installment, customPayment.amount, new Date(customPayment.date).toISOString());
  };

  const handleExportExcel = () => {
    // CSV Export
    const headers = ['Estudiante', 'Grado', ...Array.from({ length: event.installments }).map((_, i) => `Cuota ${i + 1}`), 'Progreso %'];
    const rows = students.map(student => {
      const studentPayments = payments.filter(p => p.studentId === student.id && p.status === 'paid');
      const studentTotalPaid = studentPayments.reduce((acc, p) => acc + p.amount, 0);
      const progress = event.totalAmount > 0 ? Math.round(Math.min(100, (studentTotalPaid / event.totalAmount) * 100)) : 0;
      
      const installmentStatuses = Array.from({ length: event.installments }).map((_, i) => {
        const installmentNum = i + 1;
        const totalPaid = getInstallmentTotal(student.id, installmentNum);
        const installmentAmount = event.totalAmount / event.installments;
        return totalPaid >= (installmentAmount - 0.01) ? 'PAGADO' : totalPaid > 0 ? `ABONADO (${currencySymbol}${totalPaid})` : 'PENDIENTE';
      });

      return [student.name, student.grade, ...installmentStatuses, `${progress}%`];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Reporte_${event.name.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(20);
      doc.setTextColor(27, 44, 27); // forest-700
      doc.text('Reporte de Recaudación', 14, 22);
      
      doc.setFontSize(14);
      doc.setTextColor(107, 135, 107); // sage-500
      doc.text(event.name, 14, 30);
      
      doc.setFontSize(10);
      doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 38);
      doc.text(`Total Recaudado: ${currencySymbol}${event.collected || 0} / ${currencySymbol}${event.totalAmount}`, 14, 44);

      const headers = [['Estudiante', 'Grado', ...Array.from({ length: event.installments }).map((_, i) => `Cuota ${i + 1}`), 'Progreso']];
      const data = students.map(student => {
        const studentPayments = payments.filter(p => p.studentId === student.id && p.status === 'paid');
        const studentTotalPaid = studentPayments.reduce((acc, p) => acc + p.amount, 0);
        const progress = event.totalAmount > 0 ? Math.round(Math.min(100, (studentTotalPaid / event.totalAmount) * 100)) : 0;
        
        const installmentStatuses = Array.from({ length: event.installments }).map((_, i) => {
          const installmentNum = i + 1;
          const totalPaid = getInstallmentTotal(student.id, installmentNum);
          const installmentAmount = event.totalAmount / event.installments;
          return totalPaid >= (installmentAmount - 0.01) ? 'PAGADO' : totalPaid > 0 ? `ABONADO (${currencySymbol}${totalPaid})` : 'PENDIENTE';
        });

        return [student.name, student.grade, ...installmentStatuses, `${progress}%`];
      });

      autoTable(doc, {
        startY: 50,
        head: headers,
        body: data,
        theme: 'grid',
        headStyles: { fillColor: [45, 74, 45], textColor: [255, 255, 255] }, // forest-600
        styles: { fontSize: 8 },
      });

      doc.save(`Reporte_${event.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error al generar el PDF. Por favor, intente de nuevo.");
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/report/${event.id}`;
    navigator.clipboard.writeText(url);
    alert("URL de reporte copiada al portapapeles: " + url);
  };

  if (loading) return <div className="p-20 text-center">Cargando contabilidad...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sage-500 hover:text-forest-600 dark:hover:text-forest-400 transition-colors">
          <ArrowLeft className="w-5 h-5" />
          Volver a Eventos
        </button>
        <div className="flex gap-3">
          {!event.spreadsheetId && (
            <button 
              onClick={async () => {
                const gasUrl = 'https://script.google.com/macros/s/AKfycbyBmpI83PblVDOHJ7SdaDVH6kqHNy65spU4HMnYH1LT9jYkJdNYaY2BWQradKJGkgeg/exec';
                setIsSyncing(true);
                try {
                  const res = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                      action: 'createSpreadsheet',
                      eventName: event.name,
                      installments: event.installments
                    })
                  });
                  const data = await res.json();
                  if (data.spreadsheetId) {
                    await updateDoc(doc(db, 'events', event.id), {
                      spreadsheetId: data.spreadsheetId,
                      spreadsheetUrl: data.spreadsheetUrl
                    });
                    alert("Hoja de Google creada con éxito.");
                  }
                } catch (err) {
                  console.error("Error creating Google Sheet:", err);
                  alert("Error al crear la hoja de Google.");
                } finally {
                  setIsSyncing(false);
                }
              }}
              disabled={isSyncing}
              className="btn-secondary"
              title="Crear hoja de Google para este evento"
            >
              <FileSpreadsheet className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Creando Hoja...' : 'Vincular Google Sheets'}
            </button>
          )}
          {event.spreadsheetId && (
            <button 
              onClick={() => syncToGoogleSheets(payments)} 
              disabled={isSyncing}
              className="btn-secondary"
              title="Sincronizar manualmente con Google Sheets"
            >
              <FileSpreadsheet className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
            </button>
          )}
          {event.spreadsheetUrl && (
            <button 
              onClick={() => window.open(event.spreadsheetUrl, '_blank')} 
              className="btn-secondary"
            >
              <Share2 className="w-4 h-4" />
              Ver Hoja Google
            </button>
          )}
          <button onClick={handleExportExcel} className="btn-secondary">
            <FileSpreadsheet className="w-4 h-4" />
            Compartir Excel
          </button>
          <button onClick={handleExportPDF} className="btn-primary">
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="glass-card p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <span className="text-xs font-bold text-forest-600 dark:text-forest-300 uppercase tracking-widest">Contabilidad de Evento</span>
            <h2 className="text-3xl font-serif font-bold text-sage-900 dark:text-sage-100 mt-1">{event.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <p className="text-sage-500 dark:text-sage-300 text-sm">Monto por cuota: {currencySymbol}{(event.totalAmount / event.installments).toFixed(2)}</p>
              <span className="text-sage-300 dark:text-sage-600">•</span>
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-sage-400" />
                <p className="text-xs text-sage-500 dark:text-sage-300">
                  <span className="font-bold">Colaboradores:</span> {collaboratorNames.join(', ')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="text-sage-500 hover:text-forest-600 dark:hover:text-forest-400 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Clock className="w-4 h-4" />
              {showHistory ? 'Ocultar Historial' : 'Ver Historial'}
            </button>
            <div className="text-right">
              <p className="text-sm text-sage-500 dark:text-sage-400">Total Recaudado</p>
              <p className="text-4xl font-bold text-forest-600 dark:text-forest-500">{currencySymbol}{event.collected || 0}</p>
              <p className="text-xs text-sage-400 dark:text-sage-500">de {currencySymbol}{event.totalAmount} meta total</p>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showHistory && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-8"
            >
              <div className="bg-sage-50 dark:bg-sage-800 rounded-2xl p-6 border border-sage-100 dark:border-sage-700">
                <h3 className="text-lg font-bold text-sage-900 dark:text-sage-100 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-forest-600 dark:text-forest-500" />
                  Historial de Pagos Recientes
                </h3>
                <div className="max-h-80 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((p) => {
                    const student = students.find(s => s.id === p.studentId);
                    return (
                      <div key={p.id} className="flex items-center justify-between p-4 bg-white dark:bg-sage-900 rounded-xl border border-sage-100 dark:border-sage-800 shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-sage-50 dark:bg-sage-800 rounded-full flex items-center justify-center font-bold text-sage-400 dark:text-sage-500">
                            {student?.name.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-sage-900 dark:text-sage-100">{student?.name || 'Estudiante desconocido'}</p>
                            <p className="text-xs text-sage-500 dark:text-sage-500">Cuota {p.installmentNumber} • {format(new Date(p.date), 'dd/MM/yyyy HH:mm')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-forest-700 dark:text-forest-500">{currencySymbol}{p.amount}</span>
                          <button 
                            onClick={() => handleDeletePayment(p.id, p.studentId, p.amount)}
                            className="p-2 text-sage-300 hover:text-rose-500 transition-colors"
                            title="Eliminar pago"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {payments.length === 0 && (
                    <p className="text-center py-8 text-sage-400 dark:text-sage-500 italic">No hay pagos registrados aún.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-sage-50 dark:bg-sage-800 text-sage-500 dark:text-sage-400 text-xs font-bold uppercase tracking-wider border-b border-sage-100 dark:border-sage-700">
                <th className="px-6 py-4 sticky left-0 bg-sage-50 dark:bg-sage-800 z-10">Estudiante</th>
                {Array.from({ length: event.installments }).map((_, i) => (
                  <th key={i} className="px-6 py-4 text-center">Cuota {i + 1}</th>
                ))}
                <th className="px-6 py-4 text-right">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-100 dark:divide-sage-800">
              {students.map((student) => {
                const studentPayments = payments.filter(p => p.studentId === student.id && p.status === 'paid');
                const studentTotalPaid = studentPayments.reduce((acc, p) => acc + p.amount, 0);
                const progress = event.totalAmount > 0 ? Math.min(100, (studentTotalPaid / event.totalAmount) * 100) : 0;
                
                return (
                  <tr key={student.id} className="hover:bg-sage-50/30 dark:hover:bg-sage-800/30 transition-colors">
                    <td className="px-6 py-4 sticky left-0 bg-white dark:bg-sage-900 group-hover:bg-sage-50/30 dark:group-hover:bg-sage-800/30 z-10">
                      <p className="font-medium text-sage-900 dark:text-sage-100">{student.name}</p>
                      <p className="text-[10px] text-sage-400 dark:text-sage-500">{student.grade}</p>
                    </td>
                    {Array.from({ length: event.installments }).map((_, i) => {
                      const installmentNum = i + 1;
                      const totalPaid = getInstallmentTotal(student.id, installmentNum);
                      const installmentAmount = event.totalAmount / event.installments;
                      const isFullyPaid = totalPaid >= (installmentAmount - 0.01); // Handle floating point
                      
                      return (
                        <td key={i} className="px-6 py-4 text-center">
                          <button 
                            onClick={() => {
                              setSelectedPayment({ student, installment: installmentNum });
                              setPaymentModalType('options');
                              setCustomPayment({ 
                                amount: Math.max(0, installmentAmount - totalPaid), 
                                date: new Date().toISOString().split('T')[0] 
                              });
                            }}
                            className={`w-full min-w-[80px] h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
                              isFullyPaid 
                                ? 'bg-emerald-100 text-emerald-600 border-2 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30' 
                                : totalPaid > 0
                                  ? 'bg-amber-100 text-amber-600 border-2 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30'
                                  : 'bg-sage-50 text-sage-300 border-2 border-dashed border-sage-200 hover:border-sage-400 dark:bg-sage-800 dark:text-sage-500 dark:border-sage-700 dark:hover:border-sage-600'
                            }`}
                          >
                            <span className="text-[10px] font-bold">
                              {isFullyPaid ? 'PAGADO' : totalPaid > 0 ? `${currencySymbol}${totalPaid.toFixed(0)}` : 'PENDIENTE'}
                            </span>
                            {isFullyPaid ? <CheckCircle2 className="w-4 h-4" /> : totalPaid > 0 ? <Clock className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-sage-100 dark:bg-sage-800 rounded-full overflow-hidden">
                          <div className="h-full bg-forest-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs font-bold text-sage-600 dark:text-sage-400">{Math.round(progress)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Options Modal */}
      <AnimatePresence>
        {selectedPayment && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm glass-card p-8"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-serif font-bold text-forest-700 dark:text-forest-500">Gestionar Pago</h3>
                  <p className="text-sm text-sage-500 dark:text-sage-400">{selectedPayment.student.name} - Cuota {selectedPayment.installment}</p>
                </div>
                <button onClick={() => setSelectedPayment(null)} className="p-1 hover:bg-sage-100 dark:hover:bg-sage-800 rounded-lg">
                  <XCircle className="w-6 h-6 text-sage-400" />
                </button>
              </div>

              {paymentModalType === 'options' ? (
                <div className="space-y-4">
                  {/* History of payments for this installment */}
                  {getInstallmentPayments(selectedPayment.student.id, selectedPayment.installment).length > 0 && (
                    <div className="bg-sage-50 dark:bg-sage-800 p-4 rounded-xl space-y-2 max-h-40 overflow-y-auto">
                      <h4 className="text-[10px] font-bold text-sage-400 dark:text-sage-500 uppercase tracking-wider">Historial de esta cuota</h4>
                      <div className="space-y-1">
                        {getInstallmentPayments(selectedPayment.student.id, selectedPayment.installment).map((p, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[10px] bg-white dark:bg-sage-900 p-2 rounded-lg border border-sage-100 dark:border-sage-700">
                            <span className="text-sage-600 dark:text-sage-400">{format(new Date(p.date), 'dd/MM/yy HH:mm')}</span>
                            <span className="font-bold text-forest-700 dark:text-forest-500">{currencySymbol}{p.amount}</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-sage-200 dark:border-sage-700 flex justify-between items-center font-bold text-xs text-sage-900 dark:text-sage-100">
                          <span>Total Pagado:</span>
                          <span>{currencySymbol}{getInstallmentTotal(selectedPayment.student.id, selectedPayment.installment)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <button 
                      onClick={() => handleFullPayment(selectedPayment.student, selectedPayment.installment)}
                      className="w-full flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors group"
                    >
                      <div className="text-left">
                        <p className="font-bold text-emerald-700 dark:text-emerald-400">Pagar completo</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-500">Liquidar saldo restante</p>
                      </div>
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
                    </button>

                    <button 
                      onClick={() => setPaymentModalType('custom')}
                      className="w-full flex items-center justify-between p-4 bg-sage-50 dark:bg-sage-800 border border-sage-100 dark:border-sage-700 rounded-xl hover:bg-sage-100 dark:hover:bg-sage-700 transition-colors group"
                    >
                      <div className="text-left">
                        <p className="font-bold text-sage-700 dark:text-sage-200">Pagar cuota</p>
                        <p className="text-xs text-sage-500 dark:text-sage-400">Abonar monto parcial</p>
                      </div>
                      <ChevronRight className="w-6 h-6 text-sage-400" />
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCustomPayment} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Monto a pagar ({currencySymbol})</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      className="input-field"
                      value={customPayment.amount}
                      onChange={(e) => setCustomPayment({...customPayment, amount: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-sage-700 dark:text-sage-300 mb-1">Fecha de pago</label>
                    <input 
                      required
                      type="date" 
                      className="input-field"
                      value={customPayment.date}
                      onChange={(e) => setCustomPayment({...customPayment, date: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setPaymentModalType('options')} className="btn-secondary flex-1 text-xs">Atrás</button>
                    <button type="submit" className="btn-primary flex-1 text-xs">Confirmar Pago</button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

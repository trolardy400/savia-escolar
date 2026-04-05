import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate,
  useLocation,
  Link
} from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { collection, onSnapshot, getDocs, query, where } from 'firebase/firestore';
import { Student, Event } from './types';
import { StudentList } from './components/StudentList';
import { EventList } from './components/EventList';
import { DebtorList } from './components/DebtorList';
import { PaymentManager } from './components/PaymentManager';
import { Profile } from './components/Profile';
import { PublicReport } from './components/PublicReport';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  UserCircle, 
  LogOut, 
  Leaf, 
  TrendingUp, 
  AlertCircle,
  Search,
  Plus,
  ChevronRight,
  Menu,
  X,
  CreditCard,
  Moon,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// --- Components ---

const Sidebar = ({ isOpen, setIsOpen, isDark }: { isOpen: boolean, setIsOpen: (v: boolean) => void, isDark: boolean }) => {
  const location = useLocation();
  
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Users, label: 'Estudiantes', path: '/students' },
    { icon: Calendar, label: 'Eventos', path: '/events' },
    { icon: CreditCard, label: 'Deudores', path: '/debtors' },
    { icon: UserCircle, label: 'Perfil', path: '/profile' },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside 
        initial={false}
        animate={{ x: isOpen ? 0 : (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 0 : -300) }}
        className="fixed top-0 left-0 h-full w-64 bg-white dark:bg-sage-900 border-r border-sage-200 dark:border-sage-800 z-50 lg:static lg:translate-x-0 flex flex-col"
      >
        <div className="p-6 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-forest-600 rounded-xl flex items-center justify-center shadow-lg shadow-forest-200 dark:shadow-sage-950">
            <Leaf className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-serif font-bold text-forest-700 dark:text-forest-300">Savia Escolar</h1>
        </div>

        <nav className="mt-6 px-4 space-y-2 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-sage-100 dark:bg-sage-800 text-forest-700 dark:text-forest-400 font-medium' 
                    : 'text-sage-500 hover:bg-sage-50 dark:hover:bg-sage-800 hover:text-sage-700 dark:hover:text-sage-200'
                }`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-forest-600 dark:text-forest-400' : ''}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-sage-100 dark:border-sage-800 shrink-0">
          <button 
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            Cerrar Sesión
          </button>
        </div>
      </motion.aside>
    </>
  );
};

const Topbar = ({ user, onMenuClick }: { user: User, onMenuClick: () => void }) => {
  return (
    <header className="h-16 bg-white/80 dark:bg-sage-900/80 backdrop-blur-md border-b border-sage-200 dark:border-sage-800 px-6 flex items-center justify-between sticky top-0 z-30">
      <button onClick={onMenuClick} className="lg:hidden p-2 text-sage-500 hover:bg-sage-50 dark:hover:bg-sage-800 rounded-lg">
        <Menu className="w-6 h-6" />
      </button>
      
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-sage-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Buscar estudiante o evento..." 
            className="w-full pl-10 pr-4 py-2 bg-sage-50 dark:bg-sage-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-sage-200 dark:focus:ring-sage-700 outline-none dark:text-sage-100"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-sage-900 dark:text-sage-100">{user.displayName}</p>
          <p className="text-xs text-sage-500 dark:text-sage-400">Administrador</p>
        </div>
        <img 
          src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
          alt="Profile" 
          className="w-10 h-10 rounded-full border-2 border-sage-100 dark:border-sage-800"
          referrerPolicy="no-referrer"
        />
      </div>
    </header>
  );
};

// --- Pages ---
const Dashboard = ({ isDark }: { isDark: boolean }) => {
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [stats, setStats] = useState([
    { label: 'Total Recaudado', value: '$0', icon: TrendingUp, color: 'bg-emerald-500' },
    { label: 'Eventos Activos', value: '0', icon: Calendar, color: 'bg-forest-500' },
    { label: 'Deudores Críticos', value: '0', icon: AlertCircle, color: 'bg-rose-500' },
  ]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [recentDebtors, setRecentDebtors] = useState<{ student: Student, totalDebt: number, breakdown: { eventName: string, amount: number }[] }[]>([]);
  const [selectedDebtor, setSelectedDebtor] = useState<{ student: Student, totalDebt: number, breakdown: { eventName: string, amount: number }[] } | null>(null);

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

    // Fetch Events for stats and upcoming list
    let allEvents: Event[] = [];
    const eventsUnsub = onSnapshot(collection(db, 'events'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event));
      allEvents = data;
      const activeCount = data.filter(e => e.status === 'active').length;
      const totalCollected = data.reduce((acc, e) => acc + (e.collected || 0), 0);
      
      setStats(prev => [
        { ...prev[0], value: `${currencySymbol}${totalCollected}` },
        { ...prev[1], value: activeCount.toString() },
        prev[2]
      ]);
      
      setUpcomingEvents(data.filter(e => e.status !== 'completed').slice(0, 3));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
    });

    // Fetch Students and their payments for debt breakdown
    const studentsUnsub = onSnapshot(collection(db, 'students'), async (snapshot) => {
      const studentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      const debtorsCount = studentData.filter(s => (s.debt || 0) > 0).length;
      setStats(prev => [
        prev[0],
        prev[1],
        { ...prev[2], value: debtorsCount.toString() }
      ]);

      // For each debtor, calculate breakdown
      const debtorsWithBreakdown = await Promise.all(
        studentData
          .filter(s => (s.debt || 0) > 0)
          .map(async (student) => {
            const breakdown: { eventName: string, amount: number }[] = [];
            
            // For each event, check payments
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

      const sortedDebtors = debtorsWithBreakdown
        .sort((a, b) => b.totalDebt - a.totalDebt)
        .slice(0, 5);
      
      setRecentDebtors(sortedDebtors);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    return () => {
      eventsUnsub();
      studentsUnsub();
    };
  }, [currencySymbol]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-forest-700 dark:text-forest-300">Panel de Control</h2>
          <p className="text-sage-500 dark:text-sage-300">Bienvenido de nuevo, aquí está el resumen de hoy.</p>
        </div>
        <Link to="/events" className="btn-primary">
          <Plus className="w-5 h-5" />
          Nuevo Evento
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <motion.div 
            key={stat.label}
            whileHover={{ y: -5 }}
            className="glass-card p-6 flex items-center gap-4"
          >
            <div className={`w-12 h-12 ${stat.color} rounded-2xl flex items-center justify-center shadow-lg shadow-sage-200 dark:shadow-sage-950`}>
              <stat.icon className="text-white w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-sage-500 dark:text-sage-400">{stat.label}</p>
              <p className="text-2xl font-bold text-sage-900 dark:text-sage-100">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-sage-900 dark:text-sage-100">Próximos Eventos</h3>
            <Link to="/events" className="text-forest-600 dark:text-forest-400 text-sm font-medium hover:underline">Ver todos</Link>
          </div>
          <div className="space-y-4">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between p-4 bg-sage-50 dark:bg-sage-800/50 rounded-xl hover:bg-sage-100 dark:hover:bg-sage-800 transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white dark:bg-sage-800 rounded-lg flex flex-col items-center justify-center border border-sage-200 dark:border-sage-700">
                    <span className="text-xs font-bold text-forest-600 dark:text-forest-400">
                      {event.date ? format(new Date(event.date), 'MMM', { locale: es }).toUpperCase() : '---'}
                    </span>
                    <span className="text-lg font-bold leading-none dark:text-sage-100">
                      {event.date ? format(new Date(event.date), 'd') : '--'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-sage-900 dark:text-sage-100">{event.name}</p>
                    <p className="text-xs text-sage-500 dark:text-sage-400">
                      Recaudación: {event.totalAmount > 0 ? Math.round(((event.collected || 0) / event.totalAmount) * 100) : 0}%
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-sage-300 group-hover:text-forest-600 dark:group-hover:text-forest-400 transition-colors" />
              </div>
            ))}
            {upcomingEvents.length === 0 && (
              <p className="text-center py-8 text-sage-400 italic">No hay eventos próximos.</p>
            )}
          </div>
        </div>

        <div className="glass-card p-6">
          <h3 className="text-lg font-bold text-sage-900 dark:text-sage-100 mb-6">Deudores Críticos</h3>
          <div className="space-y-4">
            {recentDebtors.map((debtor) => (
              <div 
                key={debtor.student.id} 
                onClick={() => setSelectedDebtor(debtor)}
                className="flex items-center justify-between p-4 border-b border-sage-100 dark:border-sage-800 last:border-0 hover:bg-sage-50 dark:hover:bg-sage-800/50 transition-colors cursor-pointer rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-sage-200 dark:bg-sage-800 rounded-full flex items-center justify-center font-bold text-sage-600 dark:text-sage-400">
                    {debtor.student.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-sage-900 dark:text-sage-100">{debtor.student.name}</p>
                    <p className="text-xs text-sage-500 dark:text-sage-400">Grado: {debtor.student.grade}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-rose-500">{currencySymbol}{debtor.totalDebt}</p>
                  <p className="text-[10px] text-sage-400">Deuda Total</p>
                </div>
              </div>
            ))}
            {recentDebtors.length === 0 && (
              <p className="text-center py-8 text-sage-400 italic">No hay deudores registrados.</p>
            )}
          </div>
        </div>
      </div>

      {/* Debt Breakdown Modal */}
      <AnimatePresence>
        {selectedDebtor && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md glass-card p-8"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-serif font-bold text-forest-700 dark:text-forest-500">Desglose de Deuda</h3>
                  <p className="text-sage-500 dark:text-sage-400">{selectedDebtor.student.name}</p>
                </div>
                <button 
                  onClick={() => setSelectedDebtor(null)}
                  className="p-2 hover:bg-sage-100 dark:hover:bg-sage-800 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-sage-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider mb-1">Deuda Total Acumulada</p>
                  <p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{currencySymbol}{selectedDebtor.totalDebt}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-sage-400 uppercase tracking-wider px-1">Eventos Pendientes</p>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {selectedDebtor.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-4 bg-white dark:bg-sage-800 border border-sage-100 dark:border-sage-700 rounded-xl shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-sage-50 dark:bg-sage-900 rounded-lg flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-sage-400" />
                          </div>
                          <span className="font-medium text-sage-900 dark:text-sage-100">{item.eventName}</span>
                        </div>
                        <span className="font-bold text-rose-500">{currencySymbol}{item.amount}</span>
                      </div>
                    ))}
                    {selectedDebtor.breakdown.length === 0 && (
                      <p className="text-center py-4 text-sage-400 text-sm italic">No hay detalles disponibles.</p>
                    )}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setSelectedDebtor(null)}
                className="w-full mt-8 btn-primary justify-center"
              >
                Cerrar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Login = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 botanical-gradient relative overflow-hidden">
      {/* Decorative Leaves */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-forest-600/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-forest-600/10 rounded-full translate-x-1/3 translate-y-1/3 blur-3xl" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card p-8 relative z-10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-forest-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-forest-100 dark:shadow-sage-950">
            <Leaf className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-forest-700 dark:text-forest-300">Savia Escolar</h1>
          <p className="text-sage-500 dark:text-sage-300 mt-2">Gestión contable con raíz y propósito</p>
        </div>

        <div className="space-y-4">
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white dark:bg-sage-800 border border-sage-200 dark:border-sage-700 rounded-2xl hover:bg-sage-50 dark:hover:bg-sage-700 transition-all shadow-sm hover:shadow-md active:scale-95 group"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            <span className="font-medium text-sage-700 dark:text-sage-200">Continuar con Google</span>
          </button>
          
          <p className="text-center text-xs text-sage-400 dark:text-sage-500 px-8">
            Al continuar, aceptas nuestros términos de servicio y política de privacidad botánica.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check localStorage on mount
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      setIsDark(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        // Listen to user preferences for theme
        const userDocRef = doc(db, 'users', user.uid);
        onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            const prefs = doc.data().preferences;
            setIsDark(prefs?.theme === 'dark');
          } else {
            setIsDark(false);
          }
        });
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleDark = () => setIsDark(!isDark);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sage-50 dark:bg-sage-950">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        >
          <Leaf className="text-forest-600 w-12 h-12" />
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/report/:eventId" element={<PublicReport />} />
          <Route path="/*" element={
            !user ? <Login /> : (
              <div className="flex min-h-screen bg-sage-50 dark:bg-sage-950">
                <Sidebar 
                  isOpen={isSidebarOpen} 
                  setIsOpen={setIsSidebarOpen} 
                  isDark={isDark}
                />
                
                <div className="flex-1 flex flex-col min-w-0">
                  <Topbar 
                    user={user} 
                    onMenuClick={() => setIsSidebarOpen(true)} 
                  />
                  
                  <main className="flex-1 p-6 lg:p-10 overflow-y-auto">
                    <div className="max-w-7xl mx-auto">
                      <Routes>
                        <Route path="/" element={<Dashboard isDark={isDark} />} />
                        <Route path="/students" element={<StudentList />} />
                        <Route path="/events" element={<EventList />} />
                        <Route path="/debtors" element={<DebtorList />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/" />} />
                      </Routes>
                    </div>
                  </main>
                </div>
              </div>
            )
          } />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

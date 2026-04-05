import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserProfile } from '../types';
import { UserCircle, Shield, Globe, Bell, LogOut, Save, CheckCircle2, Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const currencies = [
  { code: 'CLP', symbol: '$', name: 'Peso Chileno' },
  { code: 'USD', symbol: '$', name: 'Dólar Estadounidense' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'ARS', symbol: '$', name: 'Peso Argentino' },
  { code: 'MXN', symbol: '$', name: 'Peso Mexicano' },
  { code: 'BRL', symbol: 'R$', name: 'Real Brasileño' },
  { code: 'BOB', symbol: 'Bs', name: 'Boliviano' },
];

export const Profile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setProfile(doc.data() as UserProfile);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
    });
    return unsubscribe;
  }, []);

  const handleSave = async () => {
    if (!auth.currentUser || !profile) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        preferences: profile.preferences
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTheme = async () => {
    if (!auth.currentUser || !profile) return;
    const newTheme = (profile.preferences?.theme === 'dark' ? 'light' : 'dark') as 'light' | 'dark';
    const newPrefs = { ...profile.preferences, theme: newTheme };
    setProfile({ ...profile, preferences: newPrefs });
    
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        preferences: newPrefs
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-serif font-bold text-forest-700 dark:text-forest-300">Perfil de Administrador</h2>
        <p className="text-sage-500 dark:text-sage-300">Gestiona tu información personal y preferencias del sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="glass-card p-8 text-center">
            <div className="relative inline-block">
              <img 
                src={profile.photoURL || `https://ui-avatars.com/api/?name=${profile.displayName}`} 
                alt="Profile" 
                className="w-24 h-24 rounded-full border-4 border-sage-100 dark:border-sage-800 mx-auto mb-4"
                referrerPolicy="no-referrer"
              />
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-2 border-white dark:border-sage-900 rounded-full" />
            </div>
            <h3 className="text-xl font-bold text-sage-900 dark:text-sage-100">{profile.displayName}</h3>
            <p className="text-sm text-sage-500 dark:text-sage-400">{profile.email}</p>
            <span className="inline-block mt-3 px-3 py-1 bg-forest-100 dark:bg-forest-900/30 text-forest-700 dark:text-forest-400 rounded-full text-xs font-bold uppercase tracking-wider">
              {profile.role}
            </span>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h4 className="font-bold text-sage-900 dark:text-sage-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-forest-600 dark:text-forest-500" />
              Seguridad
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-sage-600 dark:text-sage-400">Autenticación 2FA</span>
                <span className="text-rose-500 font-medium">Desactivado</span>
              </div>
              <button className="w-full btn-secondary text-xs py-2">Configurar 2FA</button>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="glass-card p-8 space-y-8">
            <div className="space-y-6">
              <h4 className="text-lg font-bold text-sage-900 dark:text-sage-100 flex items-center gap-2 border-b border-sage-100 dark:border-sage-800 pb-4">
                <Globe className="w-5 h-5 text-forest-600 dark:text-forest-500" />
                Preferencias del Sistema
              </h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sage-700 dark:text-sage-300">Idioma de la Interfaz</label>
                  <select 
                    className="input-field"
                    value={profile.preferences?.language || 'es'}
                    onChange={(e) => setProfile({...profile, preferences: {...profile.preferences, language: e.target.value}})}
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-sage-700 dark:text-sage-300">Moneda del Sistema</label>
                  <select 
                    className="input-field"
                    value={profile.preferences?.currency || 'CLP'}
                    onChange={(e) => setProfile({...profile, preferences: {...profile.preferences, currency: e.target.value}})}
                  >
                    {currencies.map(c => (
                      <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-sage-700 dark:text-sage-300">Notificaciones de Pago</label>
                  <div className="flex items-center gap-3 mt-2">
                    <button 
                      onClick={() => setProfile({...profile, preferences: {...profile.preferences, notifications: !profile.preferences?.notifications}})}
                      className={`w-12 h-6 rounded-full transition-colors relative ${profile.preferences?.notifications ? 'bg-forest-600' : 'bg-sage-200 dark:bg-sage-700'}`}
                    >
                      <motion.div 
                        animate={{ x: profile.preferences?.notifications ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                    <span className="text-sm text-sage-600 dark:text-sage-400">
                      {profile.preferences?.notifications ? 'Activadas' : 'Desactivadas'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-sage-700 dark:text-sage-300">Tema del Sistema</label>
                  <div className="flex items-center gap-3 mt-2">
                    <button 
                      onClick={toggleTheme}
                      className={`w-12 h-6 rounded-full transition-colors relative ${profile.preferences?.theme === 'dark' ? 'bg-forest-600' : 'bg-sage-200 dark:bg-sage-700'}`}
                    >
                      <motion.div 
                        animate={{ x: profile.preferences?.theme === 'dark' ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                    <span className="text-sm text-sage-600 dark:text-sage-400">
                      {profile.preferences?.theme === 'dark' ? 'Desactivar modo oscuro' : 'Activar modo oscuro'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-sage-100 dark:border-sage-800">
              <AnimatePresence>
                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Cambios guardados con éxito
                  </motion.div>
                )}
              </AnimatePresence>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary ml-auto"
              >
                {isSaving ? 'Guardando...' : (
                  <>
                    <Save className="w-5 h-5" />
                    Guardar Cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

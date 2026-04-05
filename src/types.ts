export interface Student {
  id: string;
  name: string;
  grade: string;
  parentEmail: string;
  status: 'active' | 'inactive';
  debt?: number;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  startDate: string; // Fecha de inicio de recaudación
  endDate: string;   // Fecha límite de recaudación
  totalAmount: number;
  installments: number;
  status: 'upcoming' | 'active' | 'completed';
  collected?: number;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  ownerId?: string;
  collaborators?: string[];
}

export interface Payment {
  id: string;
  studentId: string;
  eventId: string;
  installmentNumber: number;
  amount: number;
  date: string;
  status: 'paid' | 'pending' | 'overdue';
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin';
  preferences: {
    language: string;
    notifications: boolean;
    currency?: string;
    theme?: 'light' | 'dark';
  };
}

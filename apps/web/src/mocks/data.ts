export type StudentStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export type Student = {
  attendance: number;
  balance: number;
  className: string;
  email: string;
  id: string;
  lastActivity: string;
  name: string;
  status: StudentStatus;
};

export const students: readonly Student[] = [
  {
    attendance: 96,
    balance: 0,
    className: 'Terminale C',
    email: 'aminata.diallo@eleve.ci',
    id: 'EL-2024-001',
    lastActivity: '14:32',
    name: 'Aminata Diallo',
    status: 'active',
  },
  {
    attendance: 91,
    balance: 225_000,
    className: '3ème A',
    email: 'ibrahim.kone@eleve.ci',
    id: 'EL-2024-002',
    lastActivity: '12:08',
    name: 'Ibrahim Koné',
    status: 'pending',
  },
  {
    attendance: 98,
    balance: 0,
    className: '2nde B',
    email: 'fatoumata.bah@eleve.ci',
    id: 'EL-2024-003',
    lastActivity: 'Hier',
    name: 'Fatoumata Bah',
    status: 'active',
  },
  {
    attendance: 86,
    balance: 380_000,
    className: '1ère S',
    email: 'moussa.traore@eleve.ci',
    id: 'EL-2024-004',
    lastActivity: 'Hier',
    name: 'Moussa Traoré',
    status: 'suspended',
  },
  {
    attendance: 94,
    balance: 0,
    className: 'Terminale D',
    email: 'kadiatou.sylla@eleve.ci',
    id: 'EL-2024-005',
    lastActivity: '03/09',
    name: 'Kadiatou Sylla',
    status: 'active',
  },
  {
    attendance: 92,
    balance: 120_000,
    className: '4ème B',
    email: 'abdoulaye.ndiaye@eleve.ci',
    id: 'EL-2024-006',
    lastActivity: '02/09',
    name: 'Abdoulaye Ndiaye',
    status: 'active',
  },
  {
    attendance: 88,
    balance: 450_000,
    className: '6ème B',
    email: 'mariame.kone@eleve.ci',
    id: 'EL-2024-007',
    lastActivity: '30/08',
    name: 'Mariame Koné',
    status: 'inactive',
  },
  {
    attendance: 97,
    balance: 0,
    className: '5ème A',
    email: 'idrissa.ouedraogo@eleve.ci',
    id: 'EL-2024-008',
    lastActivity: '28/08',
    name: 'Idrissa Ouédraogo',
    status: 'active',
  },
];

export type Parent = {
  children: readonly string[];
  email: string;
  id: string;
  name: string;
  phone: string;
  status: 'active' | 'inactive';
};

export const parents: readonly Parent[] = [
  {
    children: ['Aminata Diallo · Terminale C'],
    email: 'm.diallo@email.ci',
    id: 'P-001',
    name: 'Mamadou Diallo',
    phone: '+225 07 08 09 10 11',
    status: 'active',
  },
  {
    children: ['Ibrahim Koné · 3ème A', 'Mariame Koné · 6ème B'],
    email: 'f.kone@email.ci',
    id: 'P-002',
    name: 'Fatoumata Koné',
    phone: '+225 05 06 07 08 09',
    status: 'active',
  },
  {
    children: ['Moussa Traoré · 1ère S'],
    email: 'o.traore@email.ci',
    id: 'P-003',
    name: 'Oumar Traoré',
    phone: '+225 01 02 03 04 05',
    status: 'active',
  },
  {
    children: ['Fatoumata Bah · 2nde B'],
    email: 'a.bah@email.ci',
    id: 'P-004',
    name: 'Aïssatou Bah',
    phone: '+225 09 10 11 12 13',
    status: 'active',
  },
  {
    children: ['Idrissa Ouédraogo · 5ème A'],
    email: 's.camara@email.ci',
    id: 'P-005',
    name: 'Seydou Camara',
    phone: '+225 03 04 05 06 07',
    status: 'inactive',
  },
];

export type Teacher = {
  classes: readonly string[];
  hours: number;
  id: string;
  name: string;
  status: 'active' | 'inactive';
  subjects: readonly string[];
};

export const teachers: readonly Teacher[] = [
  {
    classes: ['Terminale C', '1ère S'],
    hours: 24,
    id: 'ENS-001',
    name: 'Dr Koffi Assamoi',
    status: 'active',
    subjects: ['Mathématiques', 'Physique'],
  },
  {
    classes: ['3ème A', '4ème B'],
    hours: 20,
    id: 'ENS-002',
    name: 'Awa Sanogo',
    status: 'active',
    subjects: ['Français', 'Littérature'],
  },
  {
    classes: ['2nde B', '1ère L'],
    hours: 18,
    id: 'ENS-003',
    name: 'Jean-Pierre Konan',
    status: 'active',
    subjects: ['Histoire-Géographie'],
  },
  {
    classes: ['Terminale D', '2nde A'],
    hours: 16,
    id: 'ENS-004',
    name: 'Mariam Coulibaly',
    status: 'active',
    subjects: ['SVT'],
  },
  {
    classes: ['Terminale C', '3ème B'],
    hours: 22,
    id: 'ENS-005',
    name: 'Boubacar Diarra',
    status: 'inactive',
    subjects: ['Anglais'],
  },
];

export type SchoolClass = {
  capacity: number;
  count: number;
  id: string;
  level: string;
  name: string;
  room: string;
  teacher: string;
};

export const schoolClasses: readonly SchoolClass[] = [
  {
    capacity: 45,
    count: 42,
    id: 'CL-001',
    level: 'Lycée',
    name: 'Terminale C',
    room: 'A-12',
    teacher: 'K. Assamoi',
  },
  {
    capacity: 45,
    count: 38,
    id: 'CL-002',
    level: 'Lycée',
    name: 'Terminale D',
    room: 'A-14',
    teacher: 'M. Coulibaly',
  },
  {
    capacity: 45,
    count: 40,
    id: 'CL-003',
    level: 'Lycée',
    name: '1ère S',
    room: 'B-02',
    teacher: 'K. Assamoi',
  },
  {
    capacity: 45,
    count: 45,
    id: 'CL-004',
    level: 'Lycée',
    name: '2nde B',
    room: 'B-05',
    teacher: 'J.-P. Konan',
  },
  {
    capacity: 40,
    count: 35,
    id: 'CL-005',
    level: 'Collège',
    name: '3ème A',
    room: 'C-01',
    teacher: 'A. Sanogo',
  },
  {
    capacity: 40,
    count: 37,
    id: 'CL-006',
    level: 'Collège',
    name: '4ème B',
    room: 'C-03',
    teacher: 'A. Sanogo',
  },
  {
    capacity: 40,
    count: 39,
    id: 'CL-007',
    level: 'Collège',
    name: '5ème A',
    room: 'C-05',
    teacher: 'B. Diarra',
  },
  {
    capacity: 40,
    count: 40,
    id: 'CL-008',
    level: 'Collège',
    name: '6ème B',
    room: 'C-07',
    teacher: 'A. Sanogo',
  },
];

export type Subject = {
  code: string;
  coefficient: number;
  levels: readonly string[];
  name: string;
  teachers: number;
};

export const subjects: readonly Subject[] = [
  { code: 'MATH', coefficient: 5, levels: ['Lycée'], name: 'Mathématiques', teachers: 3 },
  { code: 'PHY', coefficient: 4, levels: ['Lycée'], name: 'Physique-Chimie', teachers: 2 },
  {
    code: 'SVT',
    coefficient: 4,
    levels: ['Lycée', 'Collège'],
    name: 'Sciences de la Vie et de la Terre',
    teachers: 2,
  },
  { code: 'FR', coefficient: 4, levels: ['Lycée', 'Collège'], name: 'Français', teachers: 3 },
  {
    code: 'HG',
    coefficient: 3,
    levels: ['Lycée', 'Collège'],
    name: 'Histoire-Géographie',
    teachers: 2,
  },
  { code: 'ANG', coefficient: 3, levels: ['Lycée', 'Collège'], name: 'Anglais', teachers: 2 },
  { code: 'INFO', coefficient: 2, levels: ['Lycée', 'Collège'], name: 'Informatique', teachers: 1 },
  {
    code: 'EPS',
    coefficient: 1,
    levels: ['Lycée', 'Collège'],
    name: 'Éducation physique',
    teachers: 2,
  },
];

export type InvoiceStatus = 'overdue' | 'paid' | 'pending';

export type Invoice = {
  amount: number;
  className: string;
  dueDate: string;
  id: string;
  issueDate: string;
  status: InvoiceStatus;
  student: string;
};

export const invoices: readonly Invoice[] = [
  {
    amount: 150_000,
    className: 'Terminale C',
    dueDate: '15/09/2026',
    id: 'FAC-2026-0547',
    issueDate: '01/09/2026',
    status: 'pending',
    student: 'Aminata Diallo',
  },
  {
    amount: 150_000,
    className: '3ème A',
    dueDate: '15/09/2026',
    id: 'FAC-2026-0546',
    issueDate: '01/09/2026',
    status: 'paid',
    student: 'Ibrahim Koné',
  },
  {
    amount: 150_000,
    className: '2nde B',
    dueDate: '31/08/2026',
    id: 'FAC-2026-0545',
    issueDate: '15/08/2026',
    status: 'overdue',
    student: 'Fatoumata Bah',
  },
  {
    amount: 150_000,
    className: '1ère S',
    dueDate: '15/09/2026',
    id: 'FAC-2026-0544',
    issueDate: '01/09/2026',
    status: 'pending',
    student: 'Moussa Traoré',
  },
  {
    amount: 150_000,
    className: 'Terminale D',
    dueDate: '15/09/2026',
    id: 'FAC-2026-0543',
    issueDate: '01/09/2026',
    status: 'paid',
    student: 'Kadiatou Sylla',
  },
  {
    amount: 150_000,
    className: '4ème B',
    dueDate: '31/08/2026',
    id: 'FAC-2026-0542',
    issueDate: '15/08/2026',
    status: 'overdue',
    student: 'Abdoulaye Ndiaye',
  },
];

export type DocumentRecord = {
  author: string;
  category: string;
  date: string;
  id: string;
  name: string;
  size: string;
  type: 'DOC' | 'PDF' | 'XLS';
};

export const documents: readonly DocumentRecord[] = [
  {
    author: 'Direction',
    category: 'Règlement',
    date: '01/09/2026',
    id: 'DOC-001',
    name: 'Règlement intérieur 2026–2027.pdf',
    size: '1,2 Mo',
    type: 'PDF',
  },
  {
    author: 'Direction',
    category: 'Calendrier',
    date: '01/09/2026',
    id: 'DOC-002',
    name: 'Calendrier scolaire 2026–2027.xlsx',
    size: '245 Ko',
    type: 'XLS',
  },
  {
    author: 'Dr Assamoi',
    category: 'Pédagogie',
    date: '03/09/2026',
    id: 'DOC-003',
    name: 'Fournitures — Terminale C.pdf',
    size: '568 Ko',
    type: 'PDF',
  },
  {
    author: 'Secrétariat',
    category: 'Conseil',
    date: '03/09/2026',
    id: 'DOC-004',
    name: 'Convocation conseil de classe.pdf',
    size: '320 Ko',
    type: 'PDF',
  },
  {
    author: 'Direction',
    category: 'Rapport',
    date: '31/08/2026',
    id: 'DOC-005',
    name: 'Rapport de rentrée 2026.docx',
    size: '890 Ko',
    type: 'DOC',
  },
];

export type MessageRecord = {
  date: string;
  id: string;
  recipients: string;
  sender: string;
  status: 'draft' | 'sent';
  subject: string;
  type: 'email' | 'notification' | 'sms';
};

export const messages: readonly MessageRecord[] = [
  {
    date: '04/09/2026 · 10:30',
    id: 'MSG-001',
    recipients: 'Tous les enseignants',
    sender: 'Direction',
    status: 'sent',
    subject: 'Réunion pédagogique de rentrée',
    type: 'email',
  },
  {
    date: '04/09/2026 · 08:00',
    id: 'MSG-002',
    recipients: 'Parents avec solde',
    sender: 'Comptabilité',
    status: 'sent',
    subject: 'Rappel — frais scolaires',
    type: 'sms',
  },
  {
    date: '03/09/2026 · 14:00',
    id: 'MSG-003',
    recipients: 'Tous les parents',
    sender: 'Scolarité',
    status: 'sent',
    subject: 'Ouverture du portail des familles',
    type: 'notification',
  },
  {
    date: '03/09/2026 · 09:00',
    id: 'MSG-004',
    recipients: 'Toute la communauté',
    sender: 'Direction',
    status: 'draft',
    subject: 'Journée portes ouvertes',
    type: 'email',
  },
  {
    date: '02/09/2026 · 07:45',
    id: 'MSG-005',
    recipients: 'Mamadou Diallo',
    sender: 'Système',
    status: 'sent',
    subject: 'Absence signalée — Aminata Diallo',
    type: 'sms',
  },
];

export type ReportRecord = {
  date: string;
  id: string;
  period: string;
  size: string;
  status: 'available' | 'generating';
  title: string;
  type: string;
};

export const reports: readonly ReportRecord[] = [
  {
    date: '03/09/2026',
    id: 'RPT-001',
    period: 'Rentrée 2026',
    size: '2,4 Mo',
    status: 'available',
    title: 'Situation financière de rentrée',
    type: 'Finance',
  },
  {
    date: '03/09/2026',
    id: 'RPT-002',
    period: 'Septembre 2026',
    size: '1,1 Mo',
    status: 'available',
    title: 'Rapport de présence',
    type: 'Présence',
  },
  {
    date: '02/09/2026',
    id: 'RPT-003',
    period: 'Année 2025–2026',
    size: '3,8 Mo',
    status: 'available',
    title: 'Résultats annuels — toutes classes',
    type: 'Notes',
  },
  {
    date: '01/09/2026',
    id: 'RPT-004',
    period: '2026–2027',
    size: '980 Ko',
    status: 'available',
    title: 'Tableau de bord des inscriptions',
    type: 'Inscriptions',
  },
  {
    date: '—',
    id: 'RPT-005',
    period: 'Septembre 2026',
    size: '—',
    status: 'generating',
    title: 'Prévision budgétaire mensuelle',
    type: 'Finance',
  },
];

export type UserRecord = {
  email: string;
  id: string;
  lastLogin: string;
  name: string;
  role: 'admin' | 'accountant' | 'director' | 'registrar' | 'teacher';
  status: 'active' | 'inactive';
};

export const users: readonly UserRecord[] = [
  {
    email: 'amadou.kouyate@lyceevictor.ci',
    id: 'USR-001',
    lastLogin: 'Aujourd’hui · 14:32',
    name: 'Amadou Kouyaté',
    role: 'admin',
    status: 'active',
  },
  {
    email: 'k.assamoi@lyceevictor.ci',
    id: 'USR-002',
    lastLogin: 'Aujourd’hui · 10:15',
    name: 'Dr Koffi Assamoi',
    role: 'teacher',
    status: 'active',
  },
  {
    email: 'a.sanogo@lyceevictor.ci',
    id: 'USR-003',
    lastLogin: 'Hier · 16:42',
    name: 'Awa Sanogo',
    role: 'teacher',
    status: 'active',
  },
  {
    email: 'm.diabate@lyceevictor.ci',
    id: 'USR-004',
    lastLogin: 'Aujourd’hui · 09:05',
    name: 'Moussa Diabaté',
    role: 'accountant',
    status: 'active',
  },
  {
    email: 's.kone@lyceevictor.ci',
    id: 'USR-005',
    lastLogin: 'Hier · 17:30',
    name: 'Salimata Koné',
    role: 'director',
    status: 'active',
  },
  {
    email: 'i.fofana@lyceevictor.ci',
    id: 'USR-006',
    lastLogin: 'Il y a 3 jours',
    name: 'Ibrahim Fofana',
    role: 'registrar',
    status: 'inactive',
  },
];

export type AuditRecord = {
  action: string;
  details: string;
  entity: string;
  id: number;
  severity: 'danger' | 'info' | 'success' | 'warning';
  timestamp: string;
  user: string;
};

export const auditRecords: readonly AuditRecord[] = [
  {
    action: 'CRÉER',
    details: 'Nouveau dossier — Kadiatou Sylla',
    entity: 'Élève',
    id: 1,
    severity: 'info',
    timestamp: '2026-09-04 14:32:11',
    user: 'A. Kouyaté',
  },
  {
    action: 'PAIEMENT',
    details: 'Paiement enregistré — Ibrahim Koné — 150 000 XOF',
    entity: 'Finance',
    id: 2,
    severity: 'success',
    timestamp: '2026-09-04 13:15:44',
    user: 'M. Diabaté',
  },
  {
    action: 'MODIFIER',
    details: 'Rôle modifié — Ibrahim Fofana',
    entity: 'Utilisateur',
    id: 3,
    severity: 'warning',
    timestamp: '2026-09-04 11:02:30',
    user: 'A. Kouyaté',
  },
  {
    action: 'CONNEXION',
    details: 'Connexion depuis Abidjan, Côte d’Ivoire',
    entity: 'Système',
    id: 4,
    severity: 'info',
    timestamp: '2026-09-04 09:47:05',
    user: 'S. Koné',
  },
  {
    action: 'SUPPRIMER',
    details: 'Suppression — rapport_brouillon_v1.pdf',
    entity: 'Document',
    id: 5,
    severity: 'danger',
    timestamp: '2026-09-03 17:30:22',
    user: 'A. Kouyaté',
  },
  {
    action: 'EXPORTER',
    details: 'Export PDF — résultats annuels',
    entity: 'Rapport',
    id: 6,
    severity: 'info',
    timestamp: '2026-09-03 16:12:18',
    user: 'A. Sanogo',
  },
];

export const weeklyAttendance = [94, 92, 89, 91, 88] as const;
export const monthlyIncome = [32, 42, 39, 54, 49, 63] as const;
export const monthlyExpenses = [24, 29, 27, 34, 31, 38] as const;

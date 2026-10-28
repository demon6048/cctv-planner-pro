import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { 
  Square, MousePointer2, Move, Video, 
  Settings2, Download, Presentation, Save, 
  Trash2, X, AlertCircle, CheckCircle2,
  Upload, FilePlus, Loader2, MessageCircle, Pencil, Ruler, 
  Image as ImageIcon, Database, Search, Copy, User, Phone, MapPin, Calendar
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE (KGB SECURITY) ---
const firebaseConfig = {
  apiKey: "AIzaSyAUc1FRebtgsaRsdY-juAe6B_gswH00Vug",
  authDomain: "kgbsecurity-3aa6a.firebaseapp.com",
  projectId: "kgbsecurity-3aa6a",
  storageBucket: "kgbsecurity-3aa6a.firebasestorage.app",
  messagingSenderId: "214691290227",
  appId: "1:214691290227:web:047bfcf3e20b35132c5e06"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);
const appId = 'cctv-planner-pro';
const LOCAL_STORAGE_KEY = 'kgb_cctv_projects_backup_v4';

// --- CATÁLOGO DE CÁMARAS ---
const CAMERA_DATABASE = [
  {
    id: 'hik-ds-2cd1347g2h-liu',
    label: 'Hikvision DS-2CD1347G2H-LIU (2.8mm)',
    sensorWidth: 6.22,
    focalLength: 2.8,
    hfov: 96,
    maxDist: 25
  },
  {
    id: 'ezviz-csh9c-2-8mm',
    label: 'EZVIZ H9c Dual 2K - Lente Fijo (2.8mm)',
    sensorWidth: 7.71,
    focalLength: 2.8,
    hfov: 108,
    maxDist: 15
  },
  {
    id: 'ezviz-csh9c-6mm',
    label: 'EZVIZ H9c Dual 2K - Teleobjetivo (6mm)',
    sensorWidth: 6.25,
    focalLength: 6.0,
    hfov: 55,
    maxDist: 30
  },
  {
    id: 'hik-ds-2ce12kf3tp-dls',
    label: 'Hikvision Panorámica ColorVu 180° (2.8mm)',
    sensorWidth: 5.1,
    focalLength: 2.8,
    hfov: 179,
    maxDist: 25
  },
  {
    id: 'hik-ds-2ce10df0t-pf-2-8mm',
    label: 'Hikvision DS-2CE10DF0T-PF ColorVu (2.8mm)',
    sensorWidth: 6.44,
    focalLength: 2.8,
    hfov: 98,
    maxDist: 20
  },
  {
    id: 'hik-ds-2ce10df0t-pf-3-6mm',
    label: 'Hikvision DS-2CE10DF0T-PF ColorVu (3.6mm)',
    sensorWidth: 5.62,
    focalLength: 3.6,
    hfov: 76,
    maxDist: 20
  },
  {
    id: 'hik-ds-2ce10df0t-pf-6mm',
    label: 'Hikvision DS-2CE10DF0T-PF ColorVu (6mm)',
    sensorWidth: 5.6,
    focalLength: 6.0,
    hfov: 50,
    maxDist: 20
  }
];

// --- FUNCIONES MATEMÁTICAS Y GEOMÉTRICAS ---
const toRad = (deg) => (Number(deg) || 0) * (Math.PI / 180);
const toDeg = (rad) => (Number(rad) || 0) * (180 / Math.PI);

const calcHFOV = (sensorWidth, focalLength) => {
  const sw = Number(sensorWidth);
  const fl = Number(focalLength);
  if (!sw || !fl || fl <= 0) return 90;
  return toDeg(2 * Math.atan(sw / (2 * fl)));
};

const distance = (p1, p2) => {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow((p2.x || 0) - (p1.x || 0), 2) + Math.pow((p2.y || 0) - (p1.y || 0), 2));
};

const getIntersection = (rayOrigin, rayDir, segmentA, segmentB) => {
  const rpx = rayOrigin.x, rpy = rayOrigin.y;
  const rdx = rayDir.x, rdy = rayDir.y;
  const spx = segmentA.x, spy = segmentA.y;
  const sdx = segmentB.x - spx, sdy = segmentB.y - spy;

  const det = sdx * rdy - sdy * rdx;
  if (Math.abs(det) < 1e-10) return null;

  const T2 = (rdx * (spy - rpy) + rdy * (rpx - spx)) / det;
  const T1 = rdx !== 0 ? (spx + sdx * T2 - rpx) / rdx : (spy + sdy * T2 - rpy) / rdy;

  if (T1 > 0 && T2 >= 0 && T2 <= 1) {
    return { x: rpx + rdx * T1, y: rpy + rdy * T1, distance: T1 };
  }
  return null;
};

const calculateFOVPolygon = (cam, walls, scale) => {
  const safeScale = Number(scale) || 20;
  const maxDistPx = (Number(cam.maxDist) || 15) * safeScale;
  const numRays = 60;
  const hfov = Math.min(179.5, Math.max(5, Number(cam.hfov) || 90));
  const orientation = Number(cam.orientation) || 0;
  const startAngle = orientation - (hfov / 2);
  const step = hfov / numRays;
  const cx = Number(cam.x) || 0;
  const cy = Number(cam.y) || 0;

  const points = [`${cx},${cy}`];

  for (let i = 0; i <= numRays; i++) {
    const angle = startAngle + (i * step);
    const dirX = Math.cos(toRad(angle));
    const dirY = Math.sin(toRad(angle));
    let closestDist = maxDistPx;

    (walls || []).forEach(wall => {
      const intersect = getIntersection(
        { x: cx, y: cy },
        { x: dirX, y: dirY },
        { x: Number(wall.x1) || 0, y: Number(wall.y1) || 0 },
        { x: Number(wall.x2) || 0, y: Number(wall.y2) || 0 }
      );
      if (intersect && intersect.distance < closestDist) {
        closestDist = Math.max(0, intersect.distance - 0.1);
      }
    });

    const px = cx + (dirX * closestDist);
    const py = cy + (dirY * closestDist);
    points.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }

  return points.join(' ');
};

// --- PROYECTO DEMO INICIAL ---
const DEMO_PROJECT = {
  id: 'demo-1',
  name: 'Local Comercial Principal',
  client: 'Cliente Demo S.A.',
  phone: '999999999',
  scale: 20,
  bgImage: null,
  bgOpacity: 0.75,
  bgX: 100,
  bgY: 100,
  bgWidth: 600,
  walls: [
    { id: 'w1', x1: 100, y1: 100, x2: 700, y2: 100 },
    { id: 'w2', x1: 700, y1: 100, x2: 700, y2: 500 },
    { id: 'w3', x1: 700, y1: 500, x2: 100, y2: 500 },
    { id: 'w4', x1: 100, y1: 500, x2: 100, y2: 100 },
    { id: 'w5', x1: 300, y1: 100, x2: 300, y2: 300 },
    { id: 'w6', x1: 300, y1: 300, x2: 500, y2: 300 },
    { id: 'w7', x1: 500, y1: 300, x2: 500, y2: 500 }
  ],
  cameras: [
    {
      id: 'cam-1',
      name: 'CAM-01 Recepción',
      x: 120,
      y: 120,
      orientation: 45,
      sensorWidth: 6.22,
      focalLength: 2.8,
      hfov: 96,
      maxDist: 25,
      color: '#0ea5e9',
      calcMode: 'optical',
      modelId: 'hik-ds-2cd1347g2h-liu'
    },
    {
      id: 'cam-2',
      name: 'CAM-02 Pasillo',
      x: 320,
      y: 120,
      orientation: 15,
      sensorWidth: 6.44,
      focalLength: 2.8,
      hfov: 98,
      maxDist: 20,
      color: '#10b981',
      calcMode: 'optical',
      modelId: 'hik-ds-2ce10df0t-pf-2-8mm'
    }
  ]
};

// --- COMPONENTE MODAL ---
const Modal = ({ isOpen, title, children, onClose, maxWidth = 'max-w-md' }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-2xl ${maxWidth} w-full text-slate-200 max-h-[90vh] flex flex-col`}>
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800 shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 pr-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [project, setProject] = useState(DEMO_PROJECT);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [mode, setMode] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredWallId, setHoveredWallId] = useState(null);
  const [isPresenting, setIsPresenting] = useState(false);

  // Estados de Modales
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjData, setNewProjData] = useState({ name: '', client: '', phone: '', width: 20, height: 8 });
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);

  // Estados de Base de Datos (Firebase + Respaldo Local)
  const [user, setUser] = useState(null);
  const [cloudProjects, setCloudProjects] = useState([]);
  const [localProjects, setLocalProjects] = useState(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [toast, setToast] = useState(null);

  // Estados de Interacción en el Lienzo
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [drawStart, setDrawStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [calibrationPx, setCalibrationPx] = useState(null);
  const [calibrationMeters, setCalibrationMeters] = useState('10');

  const svgRef = useRef(null);
  const logoUrl = "https://i.imgur.com/VkOs5HF.png";

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Normalización segura del proyecto activo
  const currentProject = useMemo(() => ({
    id: project?.id || 'demo-1',
    name: project?.name ?? 'Proyecto sin nombre',
    client: project?.client ?? '',
    phone: project?.phone ?? '',
    scale: Number(project?.scale) > 0 ? Number(project.scale) : 20,
    bgImage: project?.bgImage || null,
    bgOpacity: project?.bgOpacity ?? 0.75,
    bgX: project?.bgX ?? 100,
    bgY: project?.bgY ?? 100,
    bgWidth: project?.bgWidth ?? 600,
    walls: Array.isArray(project?.walls) ? project.walls : [],
    cameras: Array.isArray(project?.cameras) ? project.cameras : [],
    createdAt: project?.createdAt || Date.now(),
    updatedAt: project?.updatedAt || Date.now()
  }), [project]);

  // Guardar respaldo local siempre que cambie localProjects
  const saveLocalBackup = (projList) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projList));
      setLocalProjects(projList);
    } catch (e) {
      console.error("Local backup error:", e);
    }
  };

  // Autenticación e Inicialización de Firebase
  useEffect(() => {
    let unsubAuth = () => {};
    try {
      signInAnonymously(auth).catch(() => {
        // Si Auth anónimo no está habilitado en consola, igual permitimos usar Firestore directo
      });
      unsubAuth = onAuthStateChanged(auth, (u) => {
        setUser(u);
      });
    } catch (e) {
      console.error("Auth init error:", e);
    }
    return () => unsubAuth();
  }, []);

  // Escucha en tiempo real de la Base de Datos en Firebase
  useEffect(() => {
    const publicRef = collection(db, 'artifacts', appId, 'public', 'data', 'projects');
    const unsubPublic = onSnapshot(
      publicRef,
      (snapshot) => {
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        setCloudProjects(list);
        setIsOnline(true);
      },
      (err) => {
        console.warn("Aviso de lectura en nube:", err.message);
        setIsOnline(false);
      }
    );

    return () => unsubPublic();
  }, [user]);

  // Combinar proyectos de Firebase + Respaldo Local sin duplicados
  const savedProjects = useMemo(() => {
    const map = new Map();
    [...localProjects, ...cloudProjects].forEach(p => {
      if (!p || !p.id) return;
      const existing = map.get(p.id);
      if (!existing || (p.updatedAt || 0) >= (existing.updatedAt || 0)) {
        map.set(p.id, p);
      }
    });
    return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [cloudProjects, localProjects]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return savedProjects;
    return savedProjects.filter(p =>
      (p.client && p.client.toLowerCase().includes(q)) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.phone && p.phone.toLowerCase().includes(q))
    );
  }, [savedProjects, searchQuery]);

  // --- FUNCIONES DE BASE DE DATOS (GUARDAR, EDITAR, DUPLICAR, ELIMINAR) ---
  const saveToDatabase = async (saveAsCopy = false) => {
    setIsSaving(true);
    const targetId = (saveAsCopy || currentProject.id === 'demo-1') ? `proj-${Date.now()}` : currentProject.id;
    const targetName = saveAsCopy ? `${currentProject.name} (Copia)` : currentProject.name;

    const projData = {
      ...currentProject,
      id: targetId,
      name: targetName,
      updatedAt: Date.now()
    };

    // 1. Guardar inmediatamente en respaldo local
    const updatedLocal = [projData, ...localProjects.filter(p => p.id !== targetId)];
    saveLocalBackup(updatedLocal);
    setProject(projData);

    // 2. Guardar en Firebase Cloud
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'projects', targetId);
      await setDoc(docRef, projData);
      setIsOnline(true);
      showToast(
        saveAsCopy
          ? `Copia guardada en la Base de Datos para "${projData.client || projData.name}"`
          : `Plano de "${projData.client || projData.name}" guardado en Firebase`
      );
    } catch (e) {
      console.error("Error guardando en Firebase:", e);
      setIsOnline(false);
      showToast('Guardado en memoria local (Verifica las reglas de Firestore para sincronizar en nube)', 'error');
    }
    setIsSaving(false);
  };

  const loadProjectFromDB = (proj) => {
    setProject({
      bgOpacity: 0.75,
      bgX: 100,
      bgY: 100,
      bgWidth: 600,
      scale: 20,
      cameras: [],
      walls: [],
      ...proj
    });
    setShowProjectsModal(false);
    setView({ x: 0, y: 0, zoom: 1 });
    setSelectedId(null);
    setMode('select');
    showToast(`Plano de "${proj.client || proj.name}" cargado para edición`);
  };

  const duplicateProjectInDB = async (proj) => {
    const newId = `proj-${Date.now()}`;
    const copyData = {
      ...proj,
      id: newId,
      name: `${proj.name || 'Proyecto'} (Copia)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const updatedLocal = [copyData, ...localProjects];
    saveLocalBackup(updatedLocal);

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', newId), copyData);
      showToast('Copia del proyecto creada en la Base de Datos');
    } catch (e) {
      console.error(e);
      showToast('Copia creada localmente');
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const targetId = projectToDelete;
    setProjectToDelete(null);

    const updatedLocal = localProjects.filter(p => p.id !== targetId);
    saveLocalBackup(updatedLocal);

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', targetId));
      showToast('Cliente y plano eliminados de la Base de Datos');
    } catch (e) {
      console.error(e);
      showToast('Eliminado de la lista local');
    }
  };

  // --- CREAR NUEVO PROYECTO ---
  const generateNewProject = async () => {
    if (!newProjData.name.trim()) {
      showToast('Por favor, ingresa el lugar del proyecto', 'error');
      return;
    }

    const scale = 20;
    const wPx = (Number(newProjData.width) || 0) * scale;
    const hPx = (Number(newProjData.height) || 0) * scale;
    const startX = 100;
    const startY = 100;

    const newWalls = [];
    if (wPx > 0 && hPx > 0) {
      newWalls.push({ id: `w-${Date.now()}-1`, x1: startX, y1: startY, x2: startX + wPx, y2: startY });
      newWalls.push({ id: `w-${Date.now()}-2`, x1: startX + wPx, y1: startY, x2: startX + wPx, y2: startY + hPx });
      newWalls.push({ id: `w-${Date.now()}-3`, x1: startX + wPx, y1: startY + hPx, x2: startX, y2: startY + hPx });
      newWalls.push({ id: `w-${Date.now()}-4`, x1: startX, y1: startY + hPx, x2: startX, y2: startY });
    }

    const createdProj = {
      id: `proj-${Date.now()}`,
      name: newProjData.name.trim(),
      client: newProjData.client.trim(),
      phone: newProjData.phone.trim(),
      scale,
      bgImage: null,
      bgOpacity: 0.75,
      bgX: startX,
      bgY: startY,
      bgWidth: wPx > 0 ? wPx : 800,
      walls: newWalls,
      cameras: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    setProject(createdProj);
    setView({ x: 0, y: 0, zoom: 1 });
    setSelectedId(null);
    setShowNewProjectModal(false);
    setMode('select');

    const updatedLocal = [createdProj, ...localProjects];
    saveLocalBackup(updatedLocal);

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projects', createdProj.id), createdProj);
      setIsOnline(true);
      showToast('Nuevo cliente y plano registrado en la Base de Datos');
    } catch (e) {
      console.error(e);
      showToast('Nuevo plano creado y guardado localmente');
    }
  };

  // --- SUBIR Y COMPRIMIR IMAGEN DE GOOGLE EARTH ---
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1300;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.78);

        let initialWidth = 800;
        let initialX = 100;
        let initialY = 100;

        if (currentProject.walls.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity;
          currentProject.walls.forEach(wall => {
            minX = Math.min(minX, wall.x1, wall.x2);
            minY = Math.min(minY, wall.y1, wall.y2);
            maxX = Math.max(maxX, wall.x1, wall.x2);
          });
          if (minX !== Infinity && maxX > minX) {
            initialX = minX;
            initialY = minY;
            initialWidth = maxX - minX;
          }
        }

        setProject(p => ({
          ...p,
          bgImage: compressedDataUrl,
          bgOpacity: 0.75,
          bgX: initialX,
          bgY: initialY,
          bgWidth: initialWidth
        }));
        setSelectedId(null);
        showToast('Imagen de Google Earth cargada en el lienzo');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // --- EXPORTACIÓN INTELIGENTE CON RECORTE, RESUMEN Y LOGO ---
  const generateExportCanvas = () => {
    return new Promise((resolve, reject) => {
      const svgElement = svgRef.current;
      if (!svgElement) return reject("No SVG found");

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      currentProject.walls.forEach(w => {
        minX = Math.min(minX, w.x1, w.x2);
        minY = Math.min(minY, w.y1, w.y2);
        maxX = Math.max(maxX, w.x1, w.x2);
        maxY = Math.max(maxY, w.y1, w.y2);
      });

      currentProject.cameras.forEach(c => {
        const r = (Number(c.maxDist) || 15) * currentProject.scale;
        minX = Math.min(minX, c.x - r);
        minY = Math.min(minY, c.y - r);
        maxX = Math.max(maxX, c.x + r);
        maxY = Math.max(maxY, c.y + r);
      });

      if (currentProject.bgImage) {
        const bx = currentProject.bgX ?? 100;
        const by = currentProject.bgY ?? 100;
        const bw = currentProject.bgWidth ?? 600;
        const bh = bw * 0.65;
        minX = Math.min(minX, bx);
        minY = Math.min(minY, by);
        maxX = Math.max(maxX, bx + bw);
        maxY = Math.max(maxY, by + bh);
      }

      if (minX === Infinity) {
        minX = 0; minY = 0; maxX = 800; maxY = 600;
      }

      const exactW = (maxX - minX) / currentProject.scale;
      const exactH = (maxY - minY) / currentProject.scale;

      const padding = currentProject.scale * 2;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const contentW = Math.max(100, maxX - minX);
      const contentH = Math.max(100, maxY - minY);

      const targetWidth = 1600;
      const ratio = targetWidth / contentW;
      const targetHeight = Math.round(contentH * ratio);
      const footerH = 160;

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight + footerH;
      const ctx = canvas.getContext("2d");

      const cloneSvg = svgElement.cloneNode(true);
      cloneSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      const rootGroup = cloneSvg.querySelector('g');
      if (rootGroup) {
        rootGroup.removeAttribute('transform');
      }

      cloneSvg.setAttribute('viewBox', `${minX} ${minY} ${contentW} ${contentH}`);
      cloneSvg.setAttribute('width', targetWidth);
      cloneSvg.setAttribute('height', targetHeight);

      const svgData = new XMLSerializer().serializeToString(cloneSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const footerY = targetHeight;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, footerY, canvas.width, footerH);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, footerY, canvas.width, 4);

        const areaText = (exactW > 0 && exactH > 0)
          ? `en un perímetro aproximado de ${exactW.toFixed(1)}m x ${exactH.toFixed(1)}m`
          : 'en las instalaciones';
        const smartText = `Resumen Técnico: Se aplicaron ${currentProject.cameras.length} cámaras de seguridad ${areaText}.`;

        const pad = 40;
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(`Proyecto: ${currentProject.name || 'Sin nombre'}`, pad, footerY + 50);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'normal 24px sans-serif';
        ctx.fillText(`Cliente: ${currentProject.client || 'No especificado'}`, pad, footerY + 90);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'italic 21px sans-serif';
        ctx.fillText(smartText, pad, footerY + 130);

        const finalize = () => resolve({ canvas, url });

        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.onload = () => {
          const logoHeight = 100;
          const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
          const logoX = canvas.width - pad - logoWidth;
          const logoY = footerY + ((footerH - logoHeight) / 2);
          ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
          finalize();
        };
        logoImg.onerror = finalize;
        logoImg.src = logoUrl;
      };
      img.onerror = (err) => reject(err);
      img.src = url;
    });
  };

  const handleWhatsApp = async () => {
    if (!currentProject.phone || currentProject.phone.trim().length < 5) {
      showToast('Ingresa el número de celular del cliente en la parte superior.', 'error');
      return;
    }
    showToast('Generando plano en alta resolución...');
    try {
      const { canvas, url } = await generateExportCanvas();
      const safeName = (currentProject.name || 'Plano').replace(/\s+/g, '_');
      const a = document.createElement("a");
      a.download = `Plano_${safeName}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      URL.revokeObjectURL(url);

      const safePhone = currentProject.phone.replace(/\D/g, '');
      const phoneWithCode = safePhone.startsWith('51') ? safePhone : `51${safePhone}`;
      const msg = `Hola ${currentProject.client || ''}, ¿qué tal? Te envío el diseño preliminar del plano con la distribución de las cámaras para ${currentProject.name || 'el sitio de la instalación'}. Por favor revísalo y quedo a la espera de tu aprobación.`;

      const waUrl = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(msg)}`;
      setTimeout(() => { window.open(waUrl, '_blank'); }, 700);
    } catch (err) {
      console.error(err);
      showToast('Error al generar la imagen para WhatsApp', 'error');
    }
  };

  const handlePrint = async () => {
    showToast('Preparando documento para imprimir...');
    try {
      const { canvas, url } = await generateExportCanvas();
      URL.revokeObjectURL(url);

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Imprimir Plano - ${currentProject.name}</title>
              <style>
                @page { size: landscape; margin: 0; }
                body { margin: 0; display: flex; justify-content: center; align-items: center; background: #020617; height: 100vh; }
                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              </style>
            </head>
            <body>
              <img src="${canvas.toDataURL("image/png")}" onload="window.print();" />
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        showToast('Habilita las ventanas emergentes para imprimir', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error al preparar la impresión', 'error');
    }
  };

  // --- INTERACCIÓN CON EL LIENZO Y COORDENADAS EXACTAS ---
  const getMouseCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
      x: (rawX - (view.x || 0)) / (view.zoom || 1),
      y: (rawY - (view.y || 0)) / (view.zoom || 1)
    };
  };

  const handlePointerDown = (e) => {
    if (isPresenting) return;
    const coords = getMouseCoords(e);

    if (e.button === 1 || mode === 'pan') {
      setIsDragging('pan');
      setDragOffset({ x: e.clientX, y: e.clientY });
      return;
    }

    if (mode === 'move_bg' && currentProject.bgImage) {
      setIsDragging('bg');
      setDragOffset({
        x: coords.x - (currentProject.bgX ?? 100),
        y: coords.y - (currentProject.bgY ?? 100)
      });
      return;
    }

    if (mode === 'select') {
      if (e.target.tagName === 'svg' || e.target.tagName === 'image') {
        setSelectedId(null);
      }
    } else if (mode === 'draw_wall' || mode === 'calibrate') {
      let startX = coords.x;
      let startY = coords.y;
      if (mode === 'draw_wall') {
        const snapStep = Math.max(1, currentProject.scale / 2);
        startX = Math.round(startX / snapStep) * snapStep;
        startY = Math.round(startY / snapStep) * snapStep;
      }
      setDrawStart({ x: startX, y: startY });
      setMousePos({ x: startX, y: startY });
    } else if (mode === 'add_cam') {
      const defaultModel = CAMERA_DATABASE[0];
      const newCam = {
        id: `cam-${Date.now()}`,
        name: `CAM-0${currentProject.cameras.length + 1}`,
        x: coords.x,
        y: coords.y,
        orientation: 0,
        sensorWidth: defaultModel.sensorWidth,
        focalLength: defaultModel.focalLength,
        hfov: defaultModel.hfov,
        maxDist: defaultModel.maxDist,
        color: '#3b82f6',
        calcMode: 'optical',
        modelId: defaultModel.id
      };
      setProject(p => ({ ...p, cameras: [...(p.cameras || []), newCam] }));
      setSelectedId(newCam.id);
      setMode('select');
    }
  };

  const handlePointerMove = (e) => {
    if (isPresenting) return;
    let coords = getMouseCoords(e);

    if ((mode === 'draw_wall' || mode === 'calibrate') && drawStart) {
      if (e.shiftKey) {
        if (Math.abs(coords.x - drawStart.x) > Math.abs(coords.y - drawStart.y)) {
          coords.y = drawStart.y;
        } else {
          coords.x = drawStart.x;
        }
      }
      if (mode === 'draw_wall') {
        const snapStep = Math.max(1, currentProject.scale / 2);
        coords.x = Math.round(coords.x / snapStep) * snapStep;
        coords.y = Math.round(coords.y / snapStep) * snapStep;
      }
    }

    setMousePos(coords);

    if (isDragging === 'pan') {
      const dx = e.clientX - dragOffset.x;
      const dy = e.clientY - dragOffset.y;
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      setDragOffset({ x: e.clientX, y: e.clientY });
    } else if (isDragging === 'bg') {
      setProject(p => ({
        ...p,
        bgX: Math.round(coords.x - dragOffset.x),
        bgY: Math.round(coords.y - dragOffset.y)
      }));
    } else if (isDragging === 'object' && selectedId) {
      const camIdx = currentProject.cameras.findIndex(c => c.id === selectedId);
      if (camIdx > -1) {
        const newCams = [...currentProject.cameras];
        newCams[camIdx] = {
          ...newCams[camIdx],
          x: coords.x - dragOffset.x,
          y: coords.y - dragOffset.y
        };
        setProject(p => ({ ...p, cameras: newCams }));
      }
    } else if (isDragging === 'wall' && selectedId) {
      const wallIdx = currentProject.walls.findIndex(w => w.id === selectedId);
      if (wallIdx > -1) {
        const dx = coords.x - dragOffset.x;
        const dy = coords.y - dragOffset.y;
        const newWalls = [...currentProject.walls];
        newWalls[wallIdx] = {
          ...newWalls[wallIdx],
          x1: newWalls[wallIdx].x1 + dx,
          y1: newWalls[wallIdx].y1 + dy,
          x2: newWalls[wallIdx].x2 + dx,
          y2: newWalls[wallIdx].y2 + dy
        };
        setProject(p => ({ ...p, walls: newWalls }));
        setDragOffset(coords);
      }
    }
  };

  const handlePointerUp = () => {
    if (isDragging) setIsDragging(false);

    if (mode === 'draw_wall' && drawStart) {
      if (distance(drawStart, mousePos) > 4) {
        const newWall = {
          id: `w-${Date.now()}`,
          x1: drawStart.x,
          y1: drawStart.y,
          x2: mousePos.x,
          y2: mousePos.y
        };
        setProject(p => ({ ...p, walls: [...(p.walls || []), newWall] }));
      }
      setDrawStart(null);
    } else if (mode === 'calibrate' && drawStart) {
      const pxDist = distance(drawStart, mousePos);
      if (pxDist > 10) {
        setCalibrationPx(pxDist);
        setCalibrationMeters((pxDist / currentProject.scale).toFixed(1));
      } else {
        showToast('Traza una línea más larga sobre la imagen para calibrar', 'error');
      }
      setDrawStart(null);
    }
  };

  const applyCalibration = () => {
    const meters = parseFloat(calibrationMeters);
    if (!meters || meters <= 0 || !calibrationPx) {
      showToast('Ingresa una distancia válida en metros', 'error');
      return;
    }
    const newScale = Number((calibrationPx / meters).toFixed(2));
    setProject(p => ({ ...p, scale: Math.max(1, newScale) }));
    setCalibrationPx(null);
    setMode('select');
    showToast(`Escala calibrada a ${meters} metros reales`);
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) return;
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.max(0.15, Math.min(5, (view.zoom || 1) * (1 + delta)));

    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const mouseXBefore = (rawX - (view.x || 0)) / (view.zoom || 1);
    const mouseYBefore = (rawY - (view.y || 0)) / (view.zoom || 1);

    setView({
      zoom: newZoom,
      x: rawX - mouseXBefore * newZoom,
      y: rawY - mouseYBefore * newZoom
    });
  };

  const updateCamera = (id, updates) => {
    setProject(p => {
      const cams = [...(p.cameras || [])];
      const idx = cams.findIndex(c => c.id === id);
      if (idx === -1) return p;

      const updatedCam = { ...cams[idx], ...updates };
      if (updatedCam.calcMode === 'optical' && (updates.sensorWidth !== undefined || updates.focalLength !== undefined)) {
        updatedCam.hfov = calcHFOV(updatedCam.sensorWidth, updatedCam.focalLength);
      }
      cams[idx] = updatedCam;
      return { ...p, cameras: cams };
    });
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setProject(p => ({
      ...p,
      cameras: (p.cameras || []).filter(c => c.id !== selectedId),
      walls: (p.walls || []).filter(w => w.id !== selectedId)
    }));
    setSelectedId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
          deleteSelected();
        }
      }
      if (e.key === 'Escape') {
        setMode('select');
        setDrawStart(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  // --- RENDERIZADO DE BARRA LATERAL IZQUIERDA ---
  const renderSidebar = () => {
    const tools = [
      { id: 'select', icon: MousePointer2, label: 'Seleccionar / Mover' },
      { id: 'pan', icon: Move, label: 'Mover Vista' },
      { id: 'draw_wall', icon: Square, label: 'Dibujar Muro' },
      { id: 'add_cam', icon: Video, label: 'Añadir Cámara' },
      { id: 'calibrate', icon: Ruler, label: 'Calibrar Escala' }
    ];

    if (currentProject.bgImage) {
      tools.push({ id: 'move_bg', icon: ImageIcon, label: 'Mover Lienzo Earth' });
    }

    return (
      <div className="w-16 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col items-center md:items-stretch py-4 shrink-0 z-20">
        <div className="hidden md:block px-4 mb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Herramientas</h2>
        </div>
        <div className="flex flex-col gap-1.5 px-2 md:px-4">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`p-2.5 rounded-xl flex items-center gap-3 transition-colors ${
                mode === t.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={t.label}
            >
              <t.icon size={19} />
              <span className="hidden md:inline font-medium text-sm">{t.label}</span>
            </button>
          ))}

          {mode === 'draw_wall' && (
            <div className="hidden md:block p-2.5 mt-1 bg-blue-950/40 border border-blue-500/30 rounded-lg text-xs text-blue-300">
              Mantén presionado <b>SHIFT</b> para trazar líneas rectas.
            </div>
          )}

          {mode === 'calibrate' && (
            <div className="hidden md:block p-2.5 mt-1 bg-amber-950/40 border border-amber-500/30 rounded-lg text-xs text-amber-300">
              Traza una línea sobre un lado conocido de tu imagen de Google Earth para ajustar los metros exactos.
            </div>
          )}
        </div>

        <div className="hidden md:block px-4 mt-6 mb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Base de Datos y Lienzo</h2>
        </div>
        <div className="flex flex-col gap-2 px-2 md:px-4">
          <button
            onClick={() => {
              setNewProjData({ name: '', client: '', phone: '', width: 20, height: 8 });
              setShowNewProjectModal(true);
            }}
            className="p-2.5 rounded-xl flex items-center gap-3 text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors"
          >
            <FilePlus size={19} />
            <span className="hidden md:inline font-medium text-sm">Nuevo Cliente / Plano</span>
          </button>

          <button
            onClick={() => setShowProjectsModal(true)}
            className="p-2.5 rounded-xl flex items-center gap-3 bg-blue-600/15 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 transition-colors"
          >
            <Database size={19} />
            <span className="hidden md:inline font-semibold text-sm">Base de Datos ({savedProjects.length})</span>
          </button>

          <label className="p-2.5 rounded-xl flex items-center gap-3 text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 cursor-pointer transition-colors">
            <Upload size={19} />
            <span className="hidden md:inline font-medium text-sm">Subir Google Earth</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>

        <div className="hidden md:flex mt-auto pt-6 flex-col items-center justify-center opacity-75 pb-2">
          <div className="w-12 h-0.5 bg-slate-800 rounded-full mb-2.5"></div>
          <span className="text-[11px] font-black text-slate-300 tracking-widest uppercase">KGB Technology</span>
          <span className="text-[10px] font-medium text-slate-400 mt-0.5">Creador: José Vizcarra</span>
          <span className="text-[9px] text-blue-400 mt-0.5 font-mono">v4.5.0 Cloud DB</span>
        </div>
      </div>
    );
  };

  // --- RENDERIZADO DE PANEL DERECHO DE PROPIEDADES ---
  const renderPropertyPanel = () => {
    const selectedCam = currentProject.cameras.find(c => c.id === selectedId);
    const selectedWall = currentProject.walls.find(w => w.id === selectedId);

    if (selectedWall) {
      const len = distance({ x: selectedWall.x1, y: selectedWall.y1 }, { x: selectedWall.x2, y: selectedWall.y2 }) / currentProject.scale;
      return (
        <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col shrink-0 z-20">
          <h2 className="text-base font-bold text-white mb-5 flex items-center gap-2">
            <Square className="text-blue-500" size={18} /> Propiedades del Muro
          </h2>
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 mb-4">
            <label className="block text-xs text-slate-400 mb-1">Medida Exacta</label>
            <div className="text-2xl font-mono font-bold text-blue-400">{len.toFixed(2)} m</div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Con la herramienta <b>Seleccionar</b> puedes arrastrar este muro para reubicarlo dentro del plano.
          </p>
          <button
            onClick={deleteSelected}
            className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 size={16} /> Eliminar Muro
          </button>
        </div>
      );
    }

    if (!selectedCam) {
      return (
        <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto flex flex-col shrink-0 z-20">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Ruler size={18} className="text-amber-400" /> Escala y Lienzo Earth
          </h2>

          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-3 mb-5">
            <div>
              <label className="block text-xs text-slate-300 font-medium mb-1 flex justify-between">
                <span>Escala General del Plano</span>
                <span className="text-amber-400 font-mono">{currentProject.scale.toFixed(1)} px/m</span>
              </label>
              <input
                type="range" min="2" max="100" step="0.5"
                value={currentProject.scale}
                onChange={e => setProject(p => ({ ...p, scale: parseFloat(e.target.value) }))}
                className="w-full accent-amber-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Sube o baja la escala para ajustar el metraje general del plano y el alcance de las cámaras.
              </p>
            </div>

            <button
              onClick={() => setMode('calibrate')}
              className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors border ${
                mode === 'calibrate'
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              <Ruler size={14} /> Calibrar Trazando Línea
            </button>
          </div>

          {currentProject.bgImage ? (
            <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ImageIcon size={15} className="text-blue-400" /> Imagen Google Earth
              </h3>

              <div>
                <label className="block text-xs text-slate-400 mb-1 flex justify-between">
                  <span>Tamaño de Imagen</span>
                  <span className="font-mono text-blue-400">{Math.round((currentProject.bgWidth ?? 600) / currentProject.scale)}m</span>
                </label>
                <input
                  type="range" min="100" max="4000" step="10"
                  value={currentProject.bgWidth ?? 600}
                  onChange={e => setProject(p => ({ ...p, bgWidth: parseInt(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 flex justify-between">
                  <span>Opacidad</span>
                  <span className="font-mono">{Math.round((currentProject.bgOpacity ?? 0.75) * 100)}%</span>
                </label>
                <input
                  type="range" min="0.1" max="1" step="0.05"
                  value={currentProject.bgOpacity ?? 0.75}
                  onChange={e => setProject(p => ({ ...p, bgOpacity: parseFloat(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
              </div>

              <button
                onClick={() => setMode(mode === 'move_bg' ? 'select' : 'move_bg')}
                className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors border ${
                  mode === 'move_bg'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-700/60 hover:bg-slate-700 text-slate-200 border-slate-600'
                }`}
              >
                <Move size={14} /> {mode === 'move_bg' ? 'Terminar de Mover Imagen' : 'Mover Imagen con el Ratón'}
              </button>

              <button
                onClick={() => setProject(p => ({ ...p, bgImage: null }))}
                className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> Quitar Imagen de Fondo
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed border-slate-800 rounded-xl text-slate-500">
              <Settings2 size={32} className="mb-2 opacity-30" />
              <p className="text-xs text-center">
                Selecciona una cámara o un muro para editar sus propiedades, o sube una captura de Google Earth.
              </p>
            </div>
          )}
        </div>
      );
    }

    const hfovSafe = Math.min(179, Math.max(5, Number(selectedCam.hfov) || 90));
    const maxDistSafe = Math.max(1, Number(selectedCam.maxDist) || 15);
    const beamWidth = 2 * maxDistSafe * Math.tan(toRad(hfovSafe / 2));
    const density = beamWidth > 0 ? Math.round(1920 / beamWidth) : 0;

    return (
      <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto shrink-0 z-20">
        <h2 className="text-base font-bold text-white mb-5 flex items-center gap-2">
          <Video className="text-blue-500" size={18} /> Configurar Cámara
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Catálogo de Modelos</label>
            <select
              className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500"
              value={selectedCam.modelId || ""}
              onChange={(e) => {
                const model = CAMERA_DATABASE.find(m => m.id === e.target.value);
                if (model) {
                  updateCamera(selectedCam.id, {
                    name: model.label,
                    sensorWidth: model.sensorWidth,
                    focalLength: model.focalLength,
                    hfov: model.hfov,
                    maxDist: model.maxDist,
                    calcMode: 'manual',
                    modelId: model.id
                  });
                }
              }}
            >
              <option value="" disabled>Seleccionar modelo del catálogo...</option>
              {CAMERA_DATABASE.map(cam => (
                <option key={cam.id} value={cam.id}>{cam.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Nombre / Identificador</label>
            <input
              type="text"
              value={selectedCam.name || ''}
              onChange={e => updateCamera(selectedCam.id, { name: e.target.value })}
              className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="h-px bg-slate-800 my-2" />

          <div>
            <label className="block text-xs text-slate-400 mb-1 flex justify-between">
              <span>Ángulo de Visión (HFOV)</span>
              <span className="text-blue-400 font-mono">{hfovSafe.toFixed(0)}°</span>
            </label>
            <input
              type="range" min="10" max="179"
              value={hfovSafe}
              onChange={e => updateCamera(selectedCam.id, { hfov: parseInt(e.target.value), calcMode: 'manual' })}
              className="w-full accent-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1 flex justify-between">
              <span>Orientación / Giro</span>
              <span className="text-slate-200 font-mono">{selectedCam.orientation || 0}°</span>
            </label>
            <input
              type="range" min="0" max="360"
              value={selectedCam.orientation || 0}
              onChange={e => updateCamera(selectedCam.id, { orientation: parseInt(e.target.value) })}
              className="w-full accent-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1 flex justify-between">
              <span>Alcance Representado</span>
              <span className="text-emerald-400 font-mono">{maxDistSafe}m</span>
            </label>
            <input
              type="range" min="2" max="80"
              value={maxDistSafe}
              onChange={e => updateCamera(selectedCam.id, { maxDist: parseInt(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="bg-slate-800/50 rounded-xl p-3.5 border border-slate-700/50 space-y-1.5 text-xs">
            <div className="font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
              <CheckCircle2 size={14} className="text-emerald-400" /> Cobertura Estimada
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Abertura a {maxDistSafe}m:</span>
              <span className="text-slate-200 font-mono">{beamWidth.toFixed(1)}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Densidad Horizontal:</span>
              <span className="text-slate-200 font-mono">{density} px/m</span>
            </div>
          </div>

          <button
            onClick={deleteSelected}
            className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 size={16} /> Eliminar Cámara
          </button>
        </div>
      </div>
    );
  };

  // --- RENDERIZADO DEL LIENZO PRINCIPAL ---
  const hoveredWall = currentProject.walls.find(w => w.id === hoveredWallId);
  const hoveredWallMeters = hoveredWall
    ? (distance({ x: hoveredWall.x1, y: hoveredWall.y1 }, { x: hoveredWall.x2, y: hoveredWall.y2 }) / currentProject.scale).toFixed(2)
    : null;

  return (
    <div className="h-screen flex flex-col bg-slate-950 font-sans overflow-hidden text-slate-200">
      {/* BARRA SUPERIOR */}
      <header className="min-h-14 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between px-4 py-2 gap-3 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 shrink-0 flex items-center justify-center bg-slate-950 rounded p-1 border border-slate-800">
            <img src={logoUrl} alt="KGB Logo" className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex flex-col gap-0.5">
            <input
              type="text"
              value={currentProject.name}
              onChange={e => setProject(p => ({ ...p, name: e.target.value }))}
              className="bg-transparent text-white font-bold text-sm focus:outline-none focus:border-b border-blue-500 placeholder-slate-500"
              placeholder="Lugar del proyecto"
              disabled={isPresenting}
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={currentProject.client}
                onChange={e => setProject(p => ({ ...p, client: e.target.value }))}
                className="bg-transparent text-slate-400 text-xs focus:outline-none focus:border-b border-slate-600 w-36 placeholder-slate-600"
                placeholder="Nombre del Cliente"
                disabled={isPresenting}
              />
              <span className="text-slate-600 text-xs">•</span>
              <input
                type="text"
                value={currentProject.phone}
                onChange={e => setProject(p => ({ ...p, phone: e.target.value }))}
                className="bg-transparent text-emerald-400 text-xs font-mono focus:outline-none focus:border-b border-slate-600 w-32 placeholder-slate-600"
                placeholder="Celular"
                disabled={isPresenting}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isPresenting ? (
            <>
              <div
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border flex items-center gap-1.5 ${
                  isOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="hidden lg:inline">{isOnline ? 'FIREBASE CONECTADO' : 'RESPALDO LOCAL'}</span>
              </div>

              <button
                onClick={() => setShowProjectsModal(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-500/15 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 rounded-md transition-colors flex items-center gap-1.5"
              >
                <Database size={14} /> Clientes ({savedProjects.length})
              </button>

              <button
                onClick={() => saveToDatabase(false)}
                disabled={isSaving}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar en BD
              </button>

              <button
                onClick={handleWhatsApp}
                className="px-3 py-1.5 text-xs font-semibold bg-green-500/15 text-green-400 hover:bg-green-600 hover:text-white border border-green-500/30 rounded-md transition-colors flex items-center gap-1.5"
              >
                <MessageCircle size={14} /> Enviar WA
              </button>

              <button
                onClick={handlePrint}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors flex items-center gap-1.5"
              >
                <Download size={14} /> Imprimir / PDF
              </button>

              <button
                onClick={() => { setIsPresenting(true); setSelectedId(null); }}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-all flex items-center gap-1.5"
              >
                <Presentation size={14} /> Presentar
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsPresenting(false)}
              className="px-4 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-md flex items-center gap-2"
            >
              <X size={14} /> Salir de Presentación
            </button>
          )}
        </div>
      </header>

      {/* CUERPO PRINCIPAL */}
      <div className="flex-1 flex overflow-hidden">
        {!isPresenting && renderSidebar()}

        {/* LIENZO INTERACTIVO */}
        <div
          className={`flex-1 relative overflow-hidden bg-slate-950 ${isPresenting ? '' : (mode === 'move_bg' ? 'cursor-move' : 'cursor-crosshair')}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)',
              backgroundSize: `${currentProject.scale * (view.zoom || 1)}px ${currentProject.scale * (view.zoom || 1)}px`,
              backgroundPosition: `${view.x || 0}px ${view.y || 0}px`
            }}
          />

          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: 'none' }}
          >
            <g transform={`translate(${view.x || 0}, ${view.y || 0}) scale(${view.zoom || 1})`}>
              {/* IMAGEN DE GOOGLE EARTH */}
              {currentProject.bgImage && (
                <image
                  href={currentProject.bgImage}
                  x={currentProject.bgX ?? 100}
                  y={currentProject.bgY ?? 100}
                  width={currentProject.bgWidth ?? 600}
                  opacity={currentProject.bgOpacity ?? 0.75}
                  className={mode === 'move_bg' ? "cursor-move" : "pointer-events-none"}
                />
              )}

              {/* CONOS DE VISIÓN DE CÁMARAS */}
              {currentProject.cameras.map(cam => {
                const polygonPoints = calculateFOVPolygon(cam, currentProject.walls, currentProject.scale);
                const isSelected = selectedId === cam.id;
                return (
                  <polygon
                    key={`fov-${cam.id}`}
                    points={polygonPoints}
                    fill={cam.color || '#3b82f6'}
                    fillOpacity={isSelected ? "0.35" : "0.2"}
                    stroke={cam.color || '#3b82f6'}
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    className="pointer-events-none"
                  />
                );
              })}

              {/* MUROS LIMPIOS (MEDIDA AL PASAR EL RATÓN O SELECCIONAR) */}
              {currentProject.walls.map(wall => {
                const len = distance({ x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }) / currentProject.scale;
                const midX = (wall.x1 + wall.x2) / 2;
                const midY = (wall.y1 + wall.y2) / 2;
                const isSelected = selectedId === wall.id;
                const isHovered = hoveredWallId === wall.id;

                return (
                  <g key={wall.id}>
                    {/* Línea invisible más ancha para facilitar el clic y hover */}
                    <line
                      x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke="transparent"
                      strokeWidth="12"
                      className="cursor-pointer"
                      onPointerEnter={() => setHoveredWallId(wall.id)}
                      onPointerLeave={() => setHoveredWallId(null)}
                      onPointerDown={(e) => {
                        if (isPresenting || mode !== 'select') return;
                        e.stopPropagation();
                        setSelectedId(wall.id);
                        setIsDragging('wall');
                        setDragOffset(getMouseCoords(e));
                      }}
                    >
                      <title>{len.toFixed(2)} metros</title>
                    </line>

                    {/* Línea visual fina del muro */}
                    <line
                      x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                      stroke={isSelected ? "#3b82f6" : (isHovered ? "#60a5fa" : "#cbd5e1")}
                      strokeWidth={isSelected ? "3.5" : "2"}
                      strokeLinecap="round"
                      className="pointer-events-none"
                    />

                    {(isSelected || isHovered) && (
                      <g transform={`translate(${midX}, ${midY - 10})`} className="pointer-events-none">
                        <rect x="-28" y="-12" width="56" height="16" rx="4" fill="#0f172a" stroke="#3b82f6" strokeWidth="1" />
                        <text x="0" y="-1" fill="#60a5fa" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">
                          {len.toFixed(2)}m
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* PREVISUALIZACIÓN AL DIBUJAR MURO */}
              {mode === 'draw_wall' && drawStart && (
                <g className="pointer-events-none">
                  <line
                    x1={drawStart.x} y1={drawStart.y} x2={mousePos.x} y2={mousePos.y}
                    stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 5"
                  />
                  <text
                    x={(drawStart.x + mousePos.x) / 2}
                    y={(drawStart.y + mousePos.y) / 2 - 8}
                    fill="#60a5fa"
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {(distance(drawStart, mousePos) / currentProject.scale).toFixed(2)}m
                  </text>
                </g>
              )}

              {/* PREVISUALIZACIÓN AL CALIBRAR ESCALA */}
              {mode === 'calibrate' && drawStart && (
                <g className="pointer-events-none">
                  <line
                    x1={drawStart.x} y1={drawStart.y} x2={mousePos.x} y2={mousePos.y}
                    stroke="#f59e0b" strokeWidth="3" strokeDasharray="4 4"
                  />
                  <circle cx={drawStart.x} cy={drawStart.y} r="4" fill="#f59e0b" />
                  <circle cx={mousePos.x} cy={mousePos.y} r="4" fill="#f59e0b" />
                </g>
              )}

              {/* ICONOS DE CÁMARAS */}
              {currentProject.cameras.map(cam => {
                const isSelected = selectedId === cam.id;
                return (
                  <g
                    key={cam.id}
                    transform={`translate(${cam.x || 0}, ${cam.y || 0})`}
                    className={mode === 'select' ? "cursor-grab active:cursor-grabbing" : ""}
                    onPointerDown={(e) => {
                      if (isPresenting || mode !== 'select') return;
                      e.stopPropagation();
                      setSelectedId(cam.id);
                      setIsDragging('object');
                      const coords = getMouseCoords(e);
                      setDragOffset({ x: coords.x - cam.x, y: coords.y - cam.y });
                    }}
                  >
                    <circle r="13" fill={cam.color || '#3b82f6'} fillOpacity="0.2" className="pointer-events-none" />
                    <path
                      d="M 0 0 L 12 -5 L 12 5 Z"
                      fill={cam.color || '#3b82f6'}
                      transform={`rotate(${cam.orientation || 0})`}
                      className="pointer-events-none"
                    />
                    <circle r="5.5" fill={isSelected ? "#fff" : (cam.color || '#3b82f6')} stroke="#0f172a" strokeWidth="2" />

                    {(isSelected || isPresenting) && (
                      <g transform="translate(12, -16)" className="pointer-events-none">
                        <rect x="0" y="0" width="125" height="18" rx="4" fill="#0f172a" fillOpacity="0.88" />
                        <text x="6" y="12" fill="#f8fafc" fontSize="9.5" fontFamily="sans-serif" fontWeight="bold">
                          {(cam.name || 'Cámara').slice(0, 20)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* BARRA DE ESTADO INFERIOR PARA MEDIDAS */}
          {hoveredWallMeters && (
            <div className="absolute bottom-6 left-6 bg-slate-900/95 border border-blue-500/40 px-3.5 py-2 rounded-lg text-xs text-blue-300 font-mono shadow-lg pointer-events-none">
              Medida del muro: <b>{hoveredWallMeters} m</b>
            </div>
          )}

          <div className="absolute bottom-6 right-6 bg-slate-900/90 backdrop-blur px-4 py-2 rounded-lg border border-slate-700/60 flex items-center gap-3 text-slate-300 text-xs pointer-events-none">
            <div className="w-16 h-1 bg-amber-400 relative">
              <div className="absolute -top-1 left-0 w-0.5 h-3 bg-amber-400" />
              <div className="absolute -top-1 right-0 w-0.5 h-3 bg-amber-400" />
            </div>
            <span className="font-mono font-semibold text-amber-300">= {(64 / currentProject.scale).toFixed(1)}m</span>
          </div>
        </div>

        {!isPresenting && renderPropertyPanel()}
      </div>

      {/* MODAL: NUEVO PROYECTO */}
      <Modal isOpen={showNewProjectModal} title="Registrar Nuevo Cliente y Plano" onClose={() => setShowNewProjectModal(false)}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Lugar del Proyecto</label>
            <input
              type="text"
              value={newProjData.name}
              onChange={e => setNewProjData({ ...newProjData, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="Ej. Almacén Central / Casa 2 Pisos"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Cliente</label>
              <input
                type="text"
                value={newProjData.client}
                onChange={e => setNewProjData({ ...newProjData, client: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Ej. Gina"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Celular</label>
              <input
                type="text"
                value={newProjData.phone}
                onChange={e => setNewProjData({ ...newProjData, phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="Ej. 999999999"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ancho (metros)</label>
              <input
                type="number" step="0.5" min="0"
                value={newProjData.width}
                onChange={e => setNewProjData({ ...newProjData, width: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Largo (metros)</label>
              <input
                type="number" step="0.5" min="0"
                value={newProjData.height}
                onChange={e => setNewProjData({ ...newProjData, height: parseFloat(e.target.value) || 0 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setShowNewProjectModal(false)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">
              Cancelar
            </button>
            <button onClick={generateNewProject} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-semibold">
              Crear y Guardar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: BASE DE DATOS DE CLIENTES Y PLANOS */}
      <Modal
        isOpen={showProjectsModal}
        title="Base de Datos de Clientes y Planos"
        onClose={() => setShowProjectsModal(false)}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por cliente, lugar del proyecto o celular..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => saveToDatabase(true)}
                disabled={isSaving}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
              >
                <Copy size={14} /> Guardar Actual como Copia
              </button>
              <button
                onClick={() => {
                  setShowProjectsModal(false);
                  setNewProjData({ name: '', client: '', phone: '', width: 20, height: 8 });
                  setShowNewProjectModal(true);
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <FilePlus size={14} /> Nuevo Cliente
              </button>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[58vh] overflow-y-auto pr-1">
            {filteredProjects.length === 0 ? (
              <div className="text-center py-12 bg-slate-950/50 rounded-xl border border-dashed border-slate-800 text-slate-400">
                <Database size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No hay planos registrados con ese criterio.</p>
                <p className="text-xs text-slate-500 mt-1">Haz clic en "Guardar en BD" arriba para registrar el plano actual.</p>
              </div>
            ) : (
              filteredProjects.map(p => {
                const isCurrent = p.id === currentProject.id;
                const camCount = p.cameras?.length || 0;
                const wallCount = p.walls?.length || 0;

                return (
                  <div
                    key={p.id}
                    className={`rounded-xl p-4 border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      isCurrent ? 'bg-blue-950/30 border-blue-500/50' : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm flex items-center gap-1.5">
                          <User size={14} className="text-blue-400" />
                          {p.client || 'Cliente sin nombre'}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                          <MapPin size={13} />
                          {p.name || 'Proyecto sin lugar'}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                            En edición
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        {p.phone && (
                          <span className="flex items-center gap-1 text-emerald-400 font-mono">
                            <Phone size={12} /> {p.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Video size={12} className="text-blue-400" /> <b>{camCount}</b> Cámaras
                        </span>
                        <span className="flex items-center gap-1">
                          <Square size={12} className="text-slate-500" /> {wallCount} Muros
                        </span>
                        {p.updatedAt && (
                          <span className="flex items-center gap-1 text-slate-500">
                            <Calendar size={12} /> {new Date(p.updatedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                      <button
                        onClick={() => loadProjectFromDB(p)}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white hover:bg-blue-500 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Pencil size={14} /> Abrir / Editar Plano
                      </button>
                      <button
                        onClick={() => duplicateProjectInDB(p)}
                        className="p-2 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700"
                        title="Duplicar plano"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        onClick={() => setProjectToDelete(p.id)}
                        className="p-2 bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white rounded-lg border border-red-500/20"
                        title="Eliminar plano"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: CONFIRMAR ELIMINACIÓN */}
      <Modal isOpen={!!projectToDelete} title="Eliminar Registro" onClose={() => setProjectToDelete(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            ¿Estás seguro de que deseas eliminar este cliente y su plano de la base de datos?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setProjectToDelete(null)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">
              Cancelar
            </button>
            <button onClick={confirmDeleteProject} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm font-semibold">
              Sí, Eliminar
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL: CALIBRAR ESCALA */}
      <Modal isOpen={!!calibrationPx} title="Calibrar Escala con Medida Real" onClose={() => setCalibrationPx(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            ¿Cuántos <b>metros reales</b> mide la línea amarilla que acabas de trazar sobre tu imagen?
          </p>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Distancia Real (metros)</label>
            <input
              type="number" step="0.1" min="0.5"
              value={calibrationMeters}
              onChange={e => setCalibrationMeters(e.target.value)}
              className="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-3 py-2 text-white text-lg font-mono focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setCalibrationPx(null)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">
              Cancelar
            </button>
            <button onClick={applyCalibration} className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-white text-sm font-semibold">
              Aplicar Escala
            </button>
          </div>
        </div>
      </Modal>

      {/* NOTIFICACIÓN TOAST */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border ${
            toast.type === 'error'
              ? 'bg-red-950/95 border-red-800 text-red-200'
              : 'bg-slate-900/95 border-slate-700 text-emerald-300'
          }`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
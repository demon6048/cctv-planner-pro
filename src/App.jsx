import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { 
  Camera, Square, MousePointer2, Move, Video, 
  Settings2, Download, Presentation, Save, 
  Trash2, X, AlertCircle, CheckCircle2,
  Upload, FilePlus, FolderOpen, Loader2, MessageCircle, Pencil
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyAUc1FRebtgsaRsdY-juAe6B_gswH00Vug",
  authDomain: "kgbsecurity-3aa6a.firebaseapp.com",
  projectId: "kgbsecurity-3aa6a",
  storageBucket: "kgbsecurity-3aa6a.firebasestorage.app",
  messagingSenderId: "214691290227",
  appId: "1:214691290227:web:047bfcf3e20b35132c5e06"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = 'cctv-planner-pro';

const toRad = (deg) => deg * (Math.PI / 180);
const toDeg = (rad) => rad * (180 / Math.PI);

const calcHFOV = (sensorWidth, focalLength) => {
  if (!sensorWidth || !focalLength) return 90;
  return toDeg(2 * Math.atan(sensorWidth / (2 * focalLength)));
};

const getIntersection = (rayOrigin, rayDir, segmentA, segmentB) => {
  const rpx = rayOrigin.x, rpy = rayOrigin.y;
  const rdx = rayDir.x, rdy = rayDir.y;
  const spx = segmentA.x, spy = segmentA.y;
  const sdx = segmentB.x - spx, sdy = segmentB.y - spy;

  const det = sdx * rdy - sdy * rdx;
  if (det === 0) return null; 

  const T2 = (rdx * (spy - rpy) + rdy * (rpx - spx)) / det;
  let T1;
  
  if (rdx !== 0) T1 = (spx + sdx * T2 - rpx) / rdx;
  else T1 = (spy + sdy * T2 - rpy) / rdy;

  if (T1 > 0 && T2 >= 0 && T2 <= 1) {
    return { x: rpx + rdx * T1, y: rpy + rdy * T1, distance: T1 };
  }
  return null;
};

const distance = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

const DEMO_PROJECT = {
  id: 'demo-1',
  name: 'Local Comercial Ficticio',
  client: 'Cliente Demo S.A.',
  phone: '', 
  scale: 20,
  bgImage: null,
  walls: [
    { id: 'w1', x1: 100, y1: 100, x2: 700, y2: 100 },
    { id: 'w2', x2: 700, y2: 500, x1: 700, y1: 100 },
    { id: 'w3', x1: 700, y1: 500, x2: 100, y2: 500 },
    { id: 'w4', x2: 100, y2: 100, x1: 100, y1: 500 },
    { id: 'w5', x1: 300, y1: 100, x2: 300, y2: 300 },
    { id: 'w6', x1: 300, y1: 300, x2: 500, y2: 300 },
    { id: 'w7', x1: 500, y1: 300, x2: 500, y2: 500 },
    { id: 'w8', x1: 600, y1: 200, x2: 600, y2: 250 },
  ],
  cameras: [
    { 
      id: 'cam-1', name: 'CAM-01 Recepción', x: 120, y: 120, orientation: 45, 
      sensorWidth: 4.8, focalLength: 2.8, hfov: calcHFOV(4.8, 2.8), 
      maxDist: 15, color: '#0ea5e9', calcMode: 'optical', height: 2.5 
    },
    { 
      id: 'cam-2', name: 'CAM-02 Pasillo', x: 320, y: 120, orientation: 0, 
      sensorWidth: 4.8, focalLength: 3.6, hfov: calcHFOV(4.8, 3.6), 
      maxDist: 20, color: '#10b981', calcMode: 'optical', height: 2.5 
    }
  ]
};

const calculateFOVPolygon = (cam, walls, scale) => {
  const maxDistPx = cam.maxDist * scale;
  const numRays = 60; 
  const startAngle = cam.orientation - (cam.hfov / 2);
  const step = cam.hfov / numRays;
  
  let points = [`${cam.x},${cam.y}`]; 
  
  for (let i = 0; i <= numRays; i++) {
    const angle = startAngle + (i * step);
    const dirX = Math.cos(toRad(angle));
    const dirY = Math.sin(toRad(angle));
    
    let closestDist = maxDistPx;
    
    walls.forEach(wall => {
      const intersect = getIntersection(
        { x: cam.x, y: cam.y }, 
        { x: dirX, y: dirY }, 
        { x: wall.x1, y: wall.y1 }, 
        { x: wall.x2, y: wall.y2 }
      );
      if (intersect && intersect.distance < closestDist) {
        closestDist = intersect.distance - 0.1; 
      }
    });
    
    const px = cam.x + (dirX * closestDist);
    const py = cam.y + (dirY * closestDist);
    points.push(`${px},${py}`);
  }
  
  return points.join(' ');
};

const Modal = ({ isOpen, title, children, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-2xl max-w-md w-full text-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded"><X size={20}/></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default function App() {
  const [project, setProject] = useState(DEMO_PROJECT);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [mode, setMode] = useState('select'); 
  const [selectedId, setSelectedId] = useState(null);
  const [isPresenting, setIsPresenting] = useState(false);
  
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjData, setNewProjData] = useState({ name: 'Nuevo Local', client: 'Nombre del Cliente', phone: '', width: 20, height: 8 });

  const [user, setUser] = useState(null);
  const [savedProjects, setSavedProjects] = useState([]);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [toast, setToast] = useState(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [drawStart, setDrawStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const svgRef = useRef(null);
  const logoUrl = "https://i.imgur.com/VkOs5HF.png"; // LOGO DEL USUARIO

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        setUser(auth.currentUser);
      } catch (e) {
        console.error("Auth Error", e);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const projectsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const unsubscribe = onSnapshot(projectsRef, (snapshot) => {
      const projs = [];
      snapshot.forEach(d => projs.push(d.data()));
      setSavedProjects(projs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    }, (err) => console.error("Firestore error:", err));

    return () => unsubscribe();
  }, [user]);

  const saveToCloud = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const projData = { ...project, updatedAt: Date.now() };
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'projects', project.id);
      await setDoc(docRef, projData);
      setProject(projData);
      showToast('Proyecto guardado en la nube correctamente');
    } catch(e) {
      console.error("Save error", e);
      showToast('Error al guardar en la nube', 'error');
    }
    setIsSaving(false);
  };

  const loadProject = (proj) => {
    setProject(proj);
    setShowProjectsModal(false);
    setView({ x: 0, y: 0, zoom: 1 });
    setSelectedId(null);
    setMode('select');
    showToast('Proyecto cargado para edición');
  };

  const deleteProject = async (id) => {
    if (!user) return;
    if(window.confirm("¿Seguro que deseas eliminar este plano permanentemente?")) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'projects', id));
        showToast('Proyecto eliminado');
      } catch(e) {
        console.error(e);
      }
    }
  };

  const handleWhatsApp = () => {
    if (!project.phone || project.phone.length < 5) {
      showToast('Por favor, ingresa un celular válido en la cabecera.', 'error');
      return;
    }

    const svgElement = svgRef.current;
    if (!svgElement) return;

    try {
      if (!svgElement.getAttribute("xmlns")) {
        svgElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      const rect = svgElement.getBoundingClientRect();
      const scale = 2; 
      const footerH = 120; // Espacio extra para el pie de página inteligente

      canvas.width = rect.width * scale;
      canvas.height = (rect.height + footerH) * scale;

      const img = new Image();
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        // Fondo del plano
        ctx.fillStyle = '#020617'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Dibujar SVG
        ctx.drawImage(img, 0, 0, rect.width * scale, rect.height * scale);
        
        // Dibujar Pie de página
        const footerY = rect.height * scale;
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(0, footerY, canvas.width, footerH * scale);
        
        ctx.fillStyle = '#1e293b'; // slate-800 border
        ctx.fillRect(0, footerY, canvas.width, 2 * scale);

        // --- CALCULAR ÁREA INTELIGENTE ---
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        project.walls.forEach(w => {
            minX = Math.min(minX, w.x1, w.x2);
            minY = Math.min(minY, w.y1, w.y2);
            maxX = Math.max(maxX, w.x1, w.x2);
            maxY = Math.max(maxY, w.y1, w.y2);
        });
        
        let areaText = "en las instalaciones";
        if (minX !== Infinity && maxX > minX) {
            const w = (maxX - minX) / project.scale;
            const h = (maxY - minY) / project.scale;
            areaText = `cubriendo un perímetro aproximado de ${w.toFixed(1)}m de largo por ${h.toFixed(1)}m de ancho`;
        }
        
        const smartText = `Resumen Técnico: Se ha diseñado la distribución de ${project.cameras.length} cámaras de seguridad ${areaText}.`;

        // Textos del reporte
        const padding = 20 * scale;
        let currentY = footerY + (20 * scale);
        
        ctx.fillStyle = '#f8fafc'; // white
        ctx.font = `bold ${18 * scale}px sans-serif`;
        ctx.fillText(`Proyecto: ${project.name || 'Diseño de Seguridad'}`, padding, currentY);
        currentY += (26 * scale);

        ctx.fillStyle = '#cbd5e1'; // slate-300
        ctx.font = `normal ${15 * scale}px sans-serif`;
        ctx.fillText(`Cliente: ${project.client || 'No especificado'}`, padding, currentY);
        currentY += (26 * scale);

        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.font = `italic ${13 * scale}px sans-serif`;
        ctx.fillText(smartText, padding, currentY);

        // Función final que descarga y abre WA
        const finalizeDownload = () => {
          const a = document.createElement("a");
          a.download = `Plano_${project.name.replace(/\s+/g, '_')}.png`;
          a.href = canvas.toDataURL("image/png");
          a.click();
          URL.revokeObjectURL(url); 

          const msg = `Hola ${project.client || ''}, te envío adjunto el diseño técnico del plano con la distribución de cámaras propuesta para: ${project.name}. (Por favor, envíame la imagen que se acaba de descargar para revisarlo juntos).`;
          const waUrl = `https://wa.me/51${project.phone.replace(/\s+/g, '')}?text=${encodeURIComponent(msg)}`;
          
          setTimeout(() => { window.open(waUrl, '_blank'); }, 800); 
          showToast('Generando reporte y abriendo WhatsApp...');
        };

        // Cargar el Logo en el Canvas
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.onload = () => {
           const logoHeight = 70 * scale;
           const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
           const logoX = canvas.width - padding - logoWidth;
           const logoY = footerY + ((footerH * scale - logoHeight) / 2);
           ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
           finalizeDownload();
        };
        logoImg.onerror = () => {
           // Si falla por CORS u otro error, se descarga igual sin el logo
           finalizeDownload();
        };
        logoImg.src = logoUrl;
      };
      
      img.src = url;
    } catch (error) {
      console.error(error);
      showToast('Hubo un error al generar la imagen', 'error');
    }
  };

  const getMouseCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    
    return {
      x: (rawX - view.x) / view.zoom,
      y: (rawY - view.y) / view.zoom
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

    if (mode === 'select') {
      if (e.target.tagName === 'svg' || e.target.tagName === 'image') {
        setSelectedId(null);
      }
    } else if (mode === 'draw_wall') {
      let startX = coords.x;
      let startY = coords.y;
      const snapStep = project.scale / 2; 
      startX = Math.round(startX / snapStep) * snapStep;
      startY = Math.round(startY / snapStep) * snapStep;
      
      setDrawStart({ x: startX, y: startY });
      setMousePos({ x: startX, y: startY });
    } else if (mode === 'add_cam') {
      const newCam = {
        id: `cam-${Date.now()}`,
        name: `CAM-0${project.cameras.length + 1}`,
        x: coords.x,
        y: coords.y,
        orientation: 0,
        sensorWidth: 4.8, focalLength: 2.8, hfov: calcHFOV(4.8, 2.8),
        maxDist: 15, color: '#3b82f6', calcMode: 'optical', height: 2.5
      };
      setProject(p => ({ ...p, cameras: [...p.cameras, newCam] }));
      setSelectedId(newCam.id);
      setMode('select');
    }
  };

  const handlePointerMove = (e) => {
    if (isPresenting) return;
    let coords = getMouseCoords(e);

    if (mode === 'draw_wall' && drawStart) {
      if (e.shiftKey) {
        if (Math.abs(coords.x - drawStart.x) > Math.abs(coords.y - drawStart.y)) {
          coords.y = drawStart.y;
        } else {
          coords.x = drawStart.x;
        }
      }
      const snapStep = project.scale / 2;
      coords.x = Math.round(coords.x / snapStep) * snapStep;
      coords.y = Math.round(coords.y / snapStep) * snapStep;
    }

    setMousePos(coords);

    if (isDragging === 'pan') {
      const dx = e.clientX - dragOffset.x;
      const dy = e.clientY - dragOffset.y;
      setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
      setDragOffset({ x: e.clientX, y: e.clientY });
    } else if (isDragging === 'object' && selectedId) {
      const camIdx = project.cameras.findIndex(c => c.id === selectedId);
      if (camIdx > -1) {
        const newCams = [...project.cameras];
        newCams[camIdx] = { 
          ...newCams[camIdx], 
          x: coords.x - dragOffset.x, 
          y: coords.y - dragOffset.y 
        };
        setProject({ ...project, cameras: newCams });
      }
    } else if (isDragging === 'wall' && selectedId) {
      const wallIdx = project.walls.findIndex(w => w.id === selectedId);
      if (wallIdx > -1) {
         const dx = coords.x - dragOffset.x;
         const dy = coords.y - dragOffset.y;
         const newWalls = [...project.walls];
         newWalls[wallIdx] = {
           ...newWalls[wallIdx],
           x1: newWalls[wallIdx].x1 + dx,
           y1: newWalls[wallIdx].y1 + dy,
           x2: newWalls[wallIdx].x2 + dx,
           y2: newWalls[wallIdx].y2 + dy
         };
         setProject({ ...project, walls: newWalls });
         setDragOffset(coords); 
      }
    }
  };

  const handlePointerUp = () => {
    if (isDragging) setIsDragging(false);
    
    if (mode === 'draw_wall' && drawStart) {
      if (distance(drawStart, mousePos) > 5) { 
        const newWall = {
          id: `w-${Date.now()}`,
          x1: drawStart.x, y1: drawStart.y,
          x2: mousePos.x, y2: mousePos.y
        };
        setProject(p => ({ ...p, walls: [...p.walls, newWall] }));
      }
      setDrawStart(null);
    }
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) return; 
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const newZoom = Math.max(0.1, Math.min(5, view.zoom * (1 + delta)));
    
    const rect = svgRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const mouseXBeforeZoom = (rawX - view.x) / view.zoom;
    const mouseYBeforeZoom = (rawY - view.y) / view.zoom;

    const newViewX = rawX - mouseXBeforeZoom * newZoom;
    const newViewY = rawY - mouseYBeforeZoom * newZoom;

    setView({ zoom: newZoom, x: newViewX, y: newViewY });
  };

  const updateCamera = (id, updates) => {
    setProject(p => {
      const cams = [...p.cameras];
      const idx = cams.findIndex(c => c.id === id);
      if (idx === -1) return p;
      
      let updatedCam = { ...cams[idx], ...updates };
      
      if (updatedCam.calcMode === 'optical' && (updates.sensorWidth || updates.focalLength)) {
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
      cameras: p.cameras.filter(c => c.id !== selectedId),
      walls: p.walls.filter(w => w.id !== selectedId)
    }));
    setSelectedId(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement.tagName !== 'INPUT') {
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

  const generateNewProject = () => {
    const scale = 20; 
    const wPx = newProjData.width * scale;
    const hPx = newProjData.height * scale;
    const startX = 100;
    const startY = 100;

    const newWalls = [];
    if (newProjData.width > 0 && newProjData.height > 0) {
       newWalls.push({ id: `w-${Date.now()}-1`, x1: startX, y1: startY, x2: startX + wPx, y2: startY }); 
       newWalls.push({ id: `w-${Date.now()}-2`, x1: startX + wPx, y1: startY, x2: startX + wPx, y2: startY + hPx }); 
       newWalls.push({ id: `w-${Date.now()}-3`, x1: startX + wPx, y1: startY + hPx, x2: startX, y2: startY + hPx }); 
       newWalls.push({ id: `w-${Date.now()}-4`, x1: startX, y1: startY + hPx, x2: startX, y2: startY }); 
    }

    setProject({
      id: `proj-${Date.now()}`,
      name: newProjData.name,
      client: newProjData.client,
      phone: newProjData.phone,
      scale: scale,
      bgImage: null,
      walls: newWalls,
      cameras: []
    });
    
    setView({ x: 0, y: 0, zoom: 1 });
    setSelectedId(null);
    setShowNewProjectModal(false);
    setMode('select');
  };

  const renderSidebar = () => {
    const tools = [
      { id: 'select', icon: MousePointer2, label: 'Seleccionar' },
      { id: 'pan', icon: Move, label: 'Mover Vista' },
      { id: 'draw_wall', icon: Square, label: 'Dibujar Muro' },
      { id: 'add_cam', icon: Video, label: 'Añadir Cámara' },
    ];

    return (
      <div className="w-16 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col items-center md:items-stretch py-4 shrink-0 transition-all z-20">
        <div className="hidden md:block px-4 mb-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Herramientas</h2>
        </div>
        <div className="flex flex-col gap-2 px-2 md:px-4">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`p-3 rounded-xl flex items-center gap-3 transition-colors ${
                mode === t.id 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={t.label}
            >
              <t.icon size={20} />
              <span className="hidden md:inline font-medium text-sm">{t.label}</span>
            </button>
          ))}
          
          {mode === 'draw_wall' && (
            <div className="hidden md:block p-3 mt-1 bg-blue-900/20 border border-blue-500/30 rounded-lg text-xs text-blue-300 leading-tight">
              <b>Tip:</b> Mantén pulsado <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white mx-1">SHIFT</kbd> para líneas rectas.
            </div>
          )}
        </div>

        <div className="hidden md:block px-4 mt-8 mb-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Proyecto</h2>
        </div>
        <div className="flex flex-col gap-2 px-2 md:px-4">
          <button
            onClick={() => setShowNewProjectModal(true)}
            className="p-3 rounded-xl flex items-center gap-3 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors shadow-lg shadow-slate-900/50 border border-slate-800"
            title="Nuevo Proyecto"
          >
            <FilePlus size={20} />
            <span className="hidden md:inline font-medium text-sm">Nuevo Plano...</span>
          </button>

          <button
            onClick={() => setShowProjectsModal(true)}
            className="p-3 rounded-xl flex items-center gap-3 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors shadow-lg shadow-slate-900/50 border border-slate-800"
            title="Mis Proyectos en la Nube"
          >
            <FolderOpen size={20} />
            <span className="hidden md:inline font-medium text-sm">Mis Proyectos ({savedProjects.length})</span>
          </button>

          <label className="p-3 rounded-xl flex items-center gap-3 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer transition-colors">
            <Upload size={20} />
            <span className="hidden md:inline font-medium text-sm">Subir Plano</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files[0];
              if(file) {
                const reader = new FileReader();
                reader.onload = (ev) => setProject(p => ({...p, bgImage: ev.target.result}));
                reader.readAsDataURL(file);
              }
            }} />
          </label>
        </div>
      </div>
    );
  };

  const renderPropertyPanel = () => {
    const selectedCam = project.cameras.find(c => c.id === selectedId);
    
    if (!selectedCam) {
      return (
        <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col items-center justify-center text-slate-500 shrink-0 z-20">
          <Settings2 size={48} className="mb-4 opacity-20" />
          <p className="text-sm text-center">Seleccione un muro o cámara para ver propiedades</p>
        </div>
      );
    }

    const density = selectedCam.hfov > 0 
      ? Math.round(1920 / (2 * selectedCam.maxDist * Math.tan(toRad(selectedCam.hfov/2)))) 
      : 0;

    return (
      <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto shrink-0 custom-scrollbar z-20">
        <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Video className="text-blue-500" size={20} /> Propiedades
        </h2>
        
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Identificador</label>
            <input 
              type="text" 
              value={selectedCam.name} 
              onChange={e => updateCamera(selectedCam.id, { name: e.target.value })}
              className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="h-px bg-slate-800 my-4" />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Cálculo Óptico</h3>
            
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button 
                onClick={() => updateCamera(selectedCam.id, { calcMode: 'optical' })}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${selectedCam.calcMode === 'optical' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`}
              >Ficha Técnica</button>
              <button 
                onClick={() => updateCamera(selectedCam.id, { calcMode: 'manual' })}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${selectedCam.calcMode === 'manual' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300'}`}
              >Manual</button>
            </div>

            {selectedCam.calcMode === 'optical' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sensor (mm)</label>
                  <input type="number" step="0.1" value={selectedCam.sensorWidth} onChange={e => updateCamera(selectedCam.id, { sensorWidth: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Focal (mm)</label>
                  <input type="number" step="0.1" value={selectedCam.focalLength} onChange={e => updateCamera(selectedCam.id, { focalLength: parseFloat(e.target.value) || 0 })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white" />
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-slate-400 mb-1 flex justify-between">
                Ángulo HFOV (°) <span className="text-blue-400 font-mono">{selectedCam.hfov.toFixed(1)}°</span>
              </label>
              <input 
                type="range" min="10" max="180" 
                value={selectedCam.hfov} 
                onChange={e => updateCamera(selectedCam.id, { hfov: parseInt(e.target.value), calcMode: 'manual' })}
                className="w-full accent-blue-500"
                disabled={selectedCam.calcMode === 'optical'}
              />
            </div>
          </div>

          <div className="h-px bg-slate-800 my-4" />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">Posición y Alcance</h3>
            
            <div>
              <label className="block text-xs text-slate-400 mb-1 flex justify-between">
                Orientación <span className="text-slate-300 font-mono">{selectedCam.orientation}°</span>
              </label>
              <input type="range" min="0" max="360" value={selectedCam.orientation} onChange={e => updateCamera(selectedCam.id, { orientation: parseInt(e.target.value) })} className="w-full accent-slate-400" />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1 flex justify-between">
                Dist. Representada (m) <span className="text-slate-300 font-mono">{selectedCam.maxDist}m</span>
              </label>
              <input type="range" min="1" max="100" value={selectedCam.maxDist} onChange={e => updateCamera(selectedCam.id, { maxDist: parseInt(e.target.value) })} className="w-full accent-emerald-500" />
            </div>
          </div>

          <div className="mt-6 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <h4 className="text-xs font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2"><CheckCircle2 size={14}/> Análisis Estimado</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Ancho a {selectedCam.maxDist}m</span>
                <span className="text-slate-300 font-mono">{(2 * selectedCam.maxDist * Math.tan(toRad(selectedCam.hfov/2))).toFixed(1)}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Densidad (1080p)</span>
                <span className="text-slate-300 font-mono">{density} px/m</span>
              </div>
            </div>
          </div>
          
          <button onClick={deleteSelected} className="w-full mt-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
            <Trash2 size={16} /> Eliminar Cámara
          </button>
        </div>
      </div>
    );
  };

  const renderCanvas = () => {
    return (
      <div 
        className={`flex-1 relative overflow-hidden bg-slate-950 ${isPresenting ? '' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <div className="absolute inset-0 pointer-events-none opacity-20" 
             style={{ 
               backgroundImage: 'radial-gradient(circle, #475569 1px, transparent 1px)', 
               backgroundSize: `${project.scale * view.zoom}px ${project.scale * view.zoom}px`,
               backgroundPosition: `${view.x}px ${view.y}px`
             }} 
        />

        <svg 
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none' }} 
        >
          <g transform={`translate(${view.x}, ${view.y}) scale(${view.zoom})`}>
            
            {project.bgImage && (
               <image href={project.bgImage} x="0" y="0" width="1000" opacity="0.6" preserveAspectRatio="xMidYMid slice" className="pointer-events-none" />
            )}

            {project.cameras.map(cam => {
              const polygonPoints = calculateFOVPolygon(cam, project.walls, project.scale);
              const isSelected = selectedId === cam.id;
              return (
                <polygon 
                  key={`fov-${cam.id}`}
                  points={polygonPoints}
                  fill={cam.color}
                  fillOpacity={isSelected ? "0.3" : "0.15"}
                  stroke={cam.color}
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  className="pointer-events-none transition-opacity duration-200"
                />
              );
            })}

            {project.walls.map(wall => {
              const len = distance({x: wall.x1, y: wall.y1}, {x: wall.x2, y: wall.y2}) / project.scale;
              const midX = (wall.x1 + wall.x2) / 2;
              const midY = (wall.y1 + wall.y2) / 2;
              let angle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * (180 / Math.PI);
              if (angle > 90 || angle < -90) angle += 180;

              return (
                <g key={wall.id}>
                  <line 
                    x1={wall.x1} y1={wall.y1} x2={wall.x2} y2={wall.y2}
                    stroke="#64748b" 
                    strokeWidth={selectedId === wall.id ? "4" : "2"}
                    strokeLinecap="round"
                    className="cursor-pointer hover:stroke-slate-400 transition-colors"
                    onPointerDown={(e) => { 
                      if (isPresenting || mode !== 'select') return;
                      e.stopPropagation(); 
                      setSelectedId(wall.id);
                      setIsDragging('wall');
                      setDragOffset(getMouseCoords(e)); 
                    }}
                  />
                  <text 
                    x={midX} y={midY - 5} 
                    fill={selectedId === wall.id ? "#60a5fa" : "#94a3b8"} 
                    fontSize="9" 
                    fontFamily="monospace"
                    fontWeight="bold"
                    textAnchor="middle"
                    transform={`rotate(${angle} ${midX} ${midY})`}
                    className="pointer-events-none"
                  >
                    {len.toFixed(1)}m
                  </text>
                </g>
              );
            })}

            {mode === 'draw_wall' && drawStart && (
               <g>
                 <line 
                   x1={drawStart.x} y1={drawStart.y} x2={mousePos.x} y2={mousePos.y}
                   stroke="#3b82f6" strokeWidth="2" strokeDasharray="6 6"
                 />
                 <text 
                    x={(drawStart.x + mousePos.x)/2} y={(drawStart.y + mousePos.y)/2 - 8} 
                    fill="#60a5fa" 
                    fontSize="11" 
                    fontWeight="bold"
                    fontFamily="monospace"
                    textAnchor="middle"
                    className="pointer-events-none drop-shadow-lg"
                  >
                    {(distance(drawStart, mousePos) / project.scale).toFixed(1)}m
                  </text>
               </g>
            )}

            {project.cameras.map(cam => {
              const isSelected = selectedId === cam.id;
              return (
                <g 
                  key={cam.id} 
                  transform={`translate(${cam.x}, ${cam.y})`}
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
                  <circle r="15" fill={cam.color} fillOpacity="0.2" className="pointer-events-none"/>
                  <path 
                    d="M 0 0 L 12 -5 L 12 5 Z" 
                    fill={cam.color} 
                    transform={`rotate(${cam.orientation})`}
                    className="pointer-events-none"
                  />
                  <circle r="6" fill={isSelected ? "#fff" : cam.color} stroke="#1e293b" strokeWidth="2" />
                  
                  {(isSelected || isPresenting) && (
                    <g transform="translate(15, -15)" className="pointer-events-none">
                      <rect x="0" y="0" width="100" height="20" rx="4" fill="#1e293b" fillOpacity="0.8" />
                      <text x="5" y="14" fill="#f8fafc" fontSize="10" fontFamily="sans-serif" fontWeight="bold">
                        {cam.name}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        
        <div className="absolute bottom-6 right-6 bg-slate-900/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-700/50 flex items-center gap-3 text-slate-300 text-xs pointer-events-none">
          <div className="w-16 h-1 bg-slate-500 relative">
             <div className="absolute -top-1 -left-px w-0.5 h-3 bg-slate-400"></div>
             <div className="absolute -top-1 -right-px w-0.5 h-3 bg-slate-400"></div>
          </div>
          <span>= {(64 / project.scale).toFixed(1)}m</span> 
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 font-sans overflow-hidden text-slate-200">
      
      {/* CABECERA CON EDICIÓN EN VIVO Y LOGO */}
      <header className="h-auto min-h-14 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between px-4 py-2 shrink-0 z-30">
        <div className="flex items-start gap-4 w-full md:w-auto">
          
          {/* LOGO DE LA EMPRESA */}
          <div className="h-10 w-24 shrink-0 flex items-center justify-center">
            <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>

          <div className="flex flex-col gap-1 w-full max-w-md">
            <input 
              type="text" 
              value={project.name}
              onChange={(e) => setProject({...project, name: e.target.value})}
              className="bg-transparent text-white font-bold text-sm tracking-wide leading-tight focus:outline-none focus:border-b border-blue-500 placeholder-slate-500"
              placeholder="Nombre del plano (ej. Local Comercial)"
              disabled={isPresenting}
            />
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={project.client}
                onChange={(e) => setProject({...project, client: e.target.value})}
                className="bg-transparent text-slate-400 text-[11px] leading-tight focus:outline-none focus:border-b border-slate-500 w-1/3 placeholder-slate-600"
                placeholder="Cliente"
                disabled={isPresenting}
              />
              <span className="text-slate-600 text-[10px]">-</span>
              <input 
                type="text" 
                value={project.phone || ''}
                onChange={(e) => setProject({...project, phone: e.target.value})}
                className="bg-transparent text-slate-400 text-[11px] leading-tight focus:outline-none focus:border-b border-slate-500 w-1/3 placeholder-slate-600"
                placeholder="Celular (Ej. 999 999 999)"
                disabled={isPresenting}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 md:mt-0 ml-auto">
          {!isPresenting ? (
            <>
              {/* BOTÓN WHATSAPP EXPORTADOR INTELIGENTE */}
              <button 
                onClick={handleWhatsApp}
                className="px-3 py-1.5 text-xs font-semibold bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white border border-green-500/20 rounded-md transition-colors flex items-center gap-2 shadow-lg shadow-green-900/10"
                title="Descargar plano y abrir WhatsApp"
              >
                <MessageCircle size={14}/> Enviar WA
              </button>
              
              <button 
                onClick={saveToCloud}
                disabled={isSaving || !user}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14}/>}
                Guardar Nube
              </button>
              
              <button 
                onClick={() => window.print()}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors flex items-center gap-2"
              >
                <Download size={14}/> Imprimir
              </button>
              <div className="w-px h-6 bg-slate-700 mx-1"></div>
              <button 
                onClick={() => { setIsPresenting(true); setSelectedId(null); }}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
              >
                <Presentation size={14}/> Presentar
              </button>
            </>
          ) : (
            <button 
              onClick={() => setIsPresenting(false)}
              className="px-4 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-md transition-all flex items-center gap-2"
            >
              <X size={14}/> Salir de Presentación
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {!isPresenting && renderSidebar()}
        {renderCanvas()}
        {!isPresenting && renderPropertyPanel()}
      </div>

      <Modal isOpen={showNewProjectModal} title="Crear Nuevo Plano" onClose={() => setShowNewProjectModal(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Nombre del Proyecto</label>
              <input 
                type="text" 
                value={newProjData.name} 
                onChange={e => setNewProjData({...newProjData, name: e.target.value})} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cliente</label>
              <input 
                type="text" 
                value={newProjData.client} 
                onChange={e => setNewProjData({...newProjData, client: e.target.value})} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Celular</label>
              <input 
                type="text" 
                value={newProjData.phone} 
                onChange={e => setNewProjData({...newProjData, phone: e.target.value})} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Ancho (metros)</label>
              <input 
                type="number" step="0.5" min="0"
                value={newProjData.width} 
                onChange={e => setNewProjData({...newProjData, width: parseFloat(e.target.value) || 0})} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Largo (metros)</label>
              <input 
                type="number" step="0.5" min="0"
                value={newProjData.height} 
                onChange={e => setNewProjData({...newProjData, height: parseFloat(e.target.value) || 0})} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500" 
              />
            </div>
          </div>
          <p className="text-xs text-slate-500 bg-slate-900/50 p-2 rounded border border-slate-800">
            Si introduces medidas, se dibujará el perímetro base automáticamente.
          </p>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowNewProjectModal(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors">Cancelar</button>
            <button onClick={generateNewProject} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors">Crear Plano</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showProjectsModal} title="Mis Proyectos Guardados" onClose={() => setShowProjectsModal(false)}>
        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
          {!user ? (
            <p className="text-sm text-slate-400 text-center py-6">Conectando a la nube...</p>
          ) : savedProjects.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No tienes proyectos guardados aún en la nube.</p>
          ) : (
            savedProjects.map(p => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between hover:border-slate-600 transition-colors">
                <div className="flex-1 min-w-0 pr-4">
                  <h4 className="font-semibold text-white text-sm truncate">{p.name}</h4>
                  <p className="text-xs text-slate-400 truncate">{p.client} {p.phone ? `• Cel: ${p.phone}` : ''} • {p.cameras?.length || 0} Cams</p>
                  {p.updatedAt && <p className="text-[10px] text-slate-500 mt-1">Última mod: {new Date(p.updatedAt).toLocaleDateString()}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => loadProject(p)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-500 rounded-md transition-colors" title="Editar Plano">
                    <Pencil size={14} /> <span className="text-xs font-semibold">Editar</span>
                  </button>
                  <button onClick={() => deleteProject(p.id)} className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-md transition-colors" title="Eliminar Permanentemente">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up pointer-events-none">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-2xl border ${toast.type === 'error' ? 'bg-red-950/90 border-red-900 text-red-200' : 'bg-slate-800/90 border-slate-700 text-emerald-300'}`}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background: white; }
          header, .w-16, .w-80 { display: none !important; }
          .flex-1 { background: white !important; }
          svg { filter: drop-shadow(0 0 2px rgba(0,0,0,0.1)); }
          text { fill: black !important; }
          polygon { fill-opacity: 0.2 !important; }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        @keyframes fadeInUp { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
      `}} />
    </div>
  );
}
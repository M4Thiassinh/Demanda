import { create } from 'zustand'

const useAppStore = create((set) => ({
  role: null,
  depId: null, depNombre: null,
  usuId: null, usuNombre: null,
  revisionId: null, revFolio: null,
  items: [],
  // Perfil de solicitud: 'normal' (Administración) | 'especial' (Áreas Productivas) | null
  categoria: null,
  // Área productiva del depto seleccionado (define si el usuario digita la cantidad o se autocalcula)
  esProductivo: false,

  setRole:          (role) => set({ role }),
  setCategoria:     (categoria) => set({ categoria }),
  setDepartamento:  (d) => set({ depId: d.dep_id, depNombre: d.dep_nombre, esProductivo: !!d.dep_productiva }),
  setUsuario:       (u) => set({ usuId: u.usu_id, usuNombre: u.usu_nombre }),
  setRevision:      (id, folio) => set({ revisionId: id, revFolio: folio }),

  addItem: (item) => set((s) => ({
    items: s.items.some(i => i.pro_codigo_plu === item.pro_codigo_plu)
      ? s.items.map(i => i.pro_codigo_plu === item.pro_codigo_plu ? { ...i, ...item } : i)
      : [...s.items, item],
  })),
  removeItem: (plu) => set((s) => ({ items: s.items.filter(i => i.pro_codigo_plu !== plu) })),
  clearRevision: () => set({ revisionId: null, revFolio: null, items: [] }),
  reset: () => set({ role: null, depId: null, depNombre: null, usuId: null, usuNombre: null, revisionId: null, revFolio: null, items: [], categoria: null, esProductivo: false }),

  // Cierre de sesión completo: limpia tokens persistidos (admin/master) y todo el estado.
  // Evita que en un dispositivo compartido un usuario herede la sesión de otro.
  logout: () => {
    try {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('masterToken');
    } catch (_) { /* localStorage no disponible */ }
    set({ role: null, depId: null, depNombre: null, usuId: null, usuNombre: null, revisionId: null, revFolio: null, items: [], categoria: null, esProductivo: false });
  },
}))

export default useAppStore

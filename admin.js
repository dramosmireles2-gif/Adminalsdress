// =============================================
// admin.js — Supabase
// =============================================

const datosGlobales = { inventario: [], rentas: [], clientes: [] };
let itemEditing    = null;
let rentaEditing   = null;
let clienteEditing = null;
let calendarInst   = null;
let filtroRentas   = 'activas';

function nombreArticulo(r) {
    // Acepta tanto un objeto renta como un string de id_articulo (compat)
    const id = typeof r === 'string' ? r : r?.id_articulo;
    if (!id) {
        // id_articulo null = vestido externo o crédito
        if (typeof r === 'object') {
            if (r?.estatus_renta === 'Credito' || r?.estatus_renta === 'Credito Usado') return 'Crédito a favor';
            const firstLine = (r?.ajustes || '').split('\n')[0].trim();
            return firstLine ? firstLine + ' ✦' : 'Vestido externo ✦';
        }
        return '—';
    }
    if (id === 'CREDITO') return 'Crédito a favor'; // compat con registros viejos
    if (id.startsWith('EXT:')) return id.slice(4) + ' ✦'; // compat con registros viejos
    const item = datosGlobales.inventario.find(i => i.id_articulo === id);
    return item?.nombre || id;
}

// ---- HELPER: URL de foto (AppSheet + Supabase + HTTP) ----
function obtenerUrlFoto(foto, size) {
    const placeholder = size === 'sm'
        ? 'https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'
        : 'https://placehold.co/100x120/f5f1eb/8a8a8e?text=Foto';
    if (!foto) return placeholder;
    if (foto.startsWith('http')) return foto;
    return `https://www.appsheet.com/template/gettablefileurl?appName=RentaVestidosAPP-250346467&tableName=Inventario&fileName=${encodeURIComponent(foto)}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    await cargarTodo();
    renderizarInventario(datosGlobales.inventario);
    calcularAlertas();
    // Mostrar FAB en tab inicial (inv) para móvil
    const fab = document.getElementById('fab-agregar');
    if (fab && window.innerWidth < 1024) fab.style.display = 'flex';
});

// =============================================
// ALERTAS / NOTIFICACIONES
// =============================================

function calcularAlertas() {
    const hoy    = new Date().toISOString().split('T')[0];
    const dt     = new Date(); dt.setDate(dt.getDate() + 1);
    const manana = dt.toISOString().split('T')[0];
    const alertas = [];

    datosGlobales.rentas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const nombre  = cliente?.nombre_completo || r.id_cliente;
        const vestido = nombreArticulo(r);

        if (r.estatus_renta === 'Entregada') {
            if (r.fecha_retorno && r.fecha_retorno < hoy) {
                alertas.push({ icono: 'warning', color: 'text-red-500 bg-red-50', texto: 'Devolución vencida', sub: `${nombre} — ${vestido}`, fecha: r.fecha_retorno });
            } else if (r.fecha_retorno === hoy) {
                alertas.push({ icono: 'assignment_return', color: 'text-orange-500 bg-orange-50', texto: 'Devolución hoy', sub: `${nombre} — ${vestido}`, fecha: r.fecha_retorno });
            }
        }
        if (r.estatus_renta === 'Activa' || r.estatus_renta === 'Apartada') {
            if (r.fecha_entrega === hoy) {
                alertas.push({ icono: 'checkroom', color: 'text-blue-500 bg-blue-50', texto: 'Entrega hoy', sub: `${nombre} — ${vestido}`, fecha: r.fecha_entrega });
            } else if (r.fecha_entrega === manana) {
                alertas.push({ icono: 'schedule', color: 'text-purple-500 bg-purple-50', texto: 'Entrega mañana', sub: `${nombre} — ${vestido}`, fecha: r.fecha_entrega });
            }
        }
    });

    window._alertas = alertas;
    const badge = document.getElementById('badge-notificaciones');
    if (badge) {
        if (alertas.length > 0) {
            badge.textContent = alertas.length > 9 ? '9+' : alertas.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function toggleNotificaciones() {
    const panel = document.getElementById('panel-notificaciones');
    if (!panel) return;
    const abrir = panel.classList.contains('hidden');
    if (abrir) {
        const alertas = window._alertas || [];
        const lista   = document.getElementById('lista-notificaciones');
        const badgeP  = document.getElementById('badge-panel');
        if (badgeP) badgeP.textContent = alertas.length + ' alerta' + (alertas.length !== 1 ? 's' : '');
        if (lista) {
            if (!alertas.length) {
                lista.innerHTML = '<p class="text-center text-gray-400 text-sm py-8 px-4">¡Todo al día! Sin alertas pendientes. ✓</p>';
            } else {
                lista.innerHTML = '';
                alertas.forEach(a => {
                    const div = document.createElement('div');
                    div.className = 'flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-default';
                    div.innerHTML = `
                        <div class="w-8 h-8 ${a.color} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span class="material-icons-round text-base">${a.icono}</span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs font-bold text-gray-800">${a.texto}</p>
                            <p class="text-[11px] text-gray-500 truncate mt-0.5">${a.sub}</p>
                            <p class="text-[10px] text-gray-400 mt-0.5">${a.fecha}</p>
                        </div>`;
                    lista.appendChild(div);
                });
            }
        }
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

document.addEventListener('click', e => {
    if (!e.target.closest('#btn-notificaciones') && !e.target.closest('#panel-notificaciones')) {
        document.getElementById('panel-notificaciones')?.classList.add('hidden');
    }
});

async function cargarTodo() {
    const [inv, rentas, clientes] = await Promise.all([
        sb.from('inventario').select('*').order('nombre'),
        sb.from('rentas').select('*').order('created_at', { ascending: false }),
        sb.from('clientes').select('*').order('nombre_completo')
    ]);
    datosGlobales.inventario = inv.data    || [];
    datosGlobales.rentas     = rentas.data || [];
    datosGlobales.clientes   = clientes.data || [];
}

function cambiarTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.sidebar-nav-btn').forEach(el => {
        el.classList.remove('active', 'text-pink-600', 'bg-pink-50');
        el.classList.add('text-gray-400');
    });
    document.querySelectorAll('.bottom-nav-btn').forEach(el => {
        el.classList.remove('active', 'text-pink-600');
        el.classList.add('text-gray-400');
    });
    const seccion  = document.getElementById('sec-' + tab);
    const boton    = document.getElementById('btn-tab-' + tab);
    const bnavBtn  = document.getElementById('bnav-' + tab);
    if (seccion && boton) {
        seccion.classList.remove('hidden');
        boton.classList.add('active', 'text-pink-600', 'bg-pink-50');
        boton.classList.remove('text-gray-400');
        if (tab === 'clientes')   renderizarClientes();
        if (tab === 'rentas')     renderizarRentas(datosGlobales.rentas);
        if (tab === 'finanzas')   renderizarDashboard();
        if (tab === 'calendario') setTimeout(() => renderizarCalendario(), 150);
    }
    if (bnavBtn) {
        bnavBtn.classList.add('active', 'text-pink-600');
        bnavBtn.classList.remove('text-gray-400');
    }
    // FAB agregar vestido: solo visible en tab inv, solo en móvil
    const fab = document.getElementById('fab-agregar');
    if (fab) fab.style.display = (tab === 'inv' && window.innerWidth < 1024) ? 'flex' : 'none';
    if (window.innerWidth < 1024) toggleSidebar(false);
}

function toggleSidebar(forceState) {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const isOpen   = !sidebar.classList.contains('-translate-x-full');
    const open     = forceState !== undefined ? forceState : !isOpen;
    sidebar.classList.toggle('-translate-x-full', !open);
    overlay.classList.toggle('hidden', !open);
}

let filtroActual      = '';
let tipoActual        = '';
let filtroTallaActual = '';
let vistaInventario   = 'list';

function setVista(v) {
    vistaInventario = v;
    const gridBtn = document.getElementById('vista-grid-btn');
    const listBtn = document.getElementById('vista-list-btn');
    if (gridBtn && listBtn) {
        gridBtn.className = v === 'grid' ? 'p-2.5 bg-pink-50 transition-colors' : 'p-2.5 hover:bg-gray-50 transition-colors';
        gridBtn.querySelector('span').className = v === 'grid' ? 'material-icons-round text-pink-600 text-xl' : 'material-icons-round text-gray-400 text-xl';
        listBtn.className = v === 'list' ? 'p-2.5 bg-pink-50 transition-colors' : 'p-2.5 hover:bg-gray-50 transition-colors';
        listBtn.querySelector('span').className = v === 'list' ? 'material-icons-round text-pink-600 text-xl' : 'material-icons-round text-gray-400 text-xl';
    }
    renderizarInventario(datosGlobales.inventario);
}

const CAT_BTN_BASE   = 'cat-btn px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-xs font-bold hover:border-pink-300 transition-all active:scale-95';
const CAT_BTN_ACTIVE = 'cat-btn px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold transition-all active:scale-95';

function filtrarTipo(tipo) {
    tipoActual = tipo;
    filtroTallaActual = '';
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.className = btn.dataset.cat === tipo ? CAT_BTN_ACTIVE : CAT_BTN_BASE;
    });
    actualizarBadgeFiltros();
    renderizarInventario(datosGlobales.inventario);
}

function filtrarTalla(talla) {
    filtroTallaActual = talla;
    actualizarBadgeFiltros();
    renderizarInventario(datosGlobales.inventario);
}

function renderizarFiltroTallas(lista) {
    const tallas = [...new Set(lista.map(i => i.talla).filter(t => t && t !== 'UNI'))].sort((a, b) => {
        const order = ['2XS','XS','S','M','L','XL','2XL','3XL','4XL'];
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return parseFloat(a) - parseFloat(b);
    });
    const targets = [
        document.getElementById('filtro-tallas-container'),
        document.getElementById('filtro-tallas-sheet')
    ].filter(Boolean);
    targets.forEach(container => {
        container.innerHTML = '';
        if (!tallas.length) return;
        const btnTodo = document.createElement('button');
        btnTodo.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ' + (!filtroTallaActual ? 'bg-pink-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-pink-300');
        btnTodo.textContent = 'Todas';
        btnTodo.onclick = () => filtrarTalla('');
        container.appendChild(btnTodo);
        tallas.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ' + (filtroTallaActual === t ? 'bg-pink-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-pink-300');
            btn.textContent = t;
            btn.onclick = () => filtrarTalla(t);
            container.appendChild(btn);
        });
    });
}

function actualizarBadgeFiltros() {
    const count = (tipoActual ? 1 : 0) + (filtroActual ? 1 : 0) + (filtroTallaActual ? 1 : 0);
    const badge = document.getElementById('badge-filtros');
    const btn   = document.getElementById('btn-filtros-mobile');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    if (btn) {
        if (count > 0) btn.classList.add('border-pink-400', 'text-pink-600', 'bg-pink-50');
        else btn.classList.remove('border-pink-400', 'text-pink-600', 'bg-pink-50');
    }
}

function abrirFiltrosSheet() {
    const overlay = document.getElementById('filtros-sheet-overlay');
    const sheet   = document.getElementById('filtros-sheet');
    if (!overlay || !sheet) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // doble rAF para garantizar que el navegador registra el translate-y-full antes de animarlo
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.remove('translate-y-full')));
}

function cerrarFiltrosSheet() {
    const overlay = document.getElementById('filtros-sheet-overlay');
    const sheet   = document.getElementById('filtros-sheet');
    if (!overlay || !sheet) return;
    sheet.classList.add('translate-y-full');
    setTimeout(() => overlay.classList.add('hidden'), 300);
    document.body.style.overflow = '';
}

function limpiarFiltrosSheet() {
    filtrarTipo('');
    filtrarInventario('');
    filtrarTalla('');
}

function renderizarInventario(lista) {
    const contenedor = document.getElementById('lista-admin');
    if (!contenedor) return;
    const busqueda = (document.getElementById('buscador')?.value || '').toLowerCase().trim();
    const prefiltrada = lista.filter(i => {
        const txt  = !busqueda || (i.nombre||'').toLowerCase().includes(busqueda) || (i.id_articulo||'').toLowerCase().includes(busqueda) || (i.codigo||'').toLowerCase().includes(busqueda);
        const est  = !filtroActual || i.estado_actual === filtroActual;
        const tipo = !tipoActual   || (i.tipo || 'Vestido') === tipoActual;
        return txt && est && tipo;
    });
    renderizarFiltroTallas(prefiltrada);
    let filtrada = prefiltrada.filter(i => !filtroTallaActual || i.talla === filtroTallaActual);

    // Ordenar
    const orden = document.getElementById('orden-select')?.value || 'reciente';
    if (orden === 'nombre')       filtrada = [...filtrada].sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));
    else if (orden === 'precio_asc')  filtrada = [...filtrada].sort((a,b) => (a.precio_base||0) - (b.precio_base||0));
    else if (orden === 'precio_desc') filtrada = [...filtrada].sort((a,b) => (b.precio_base||0) - (a.precio_base||0));

    // Actualizar contador
    const contador = document.getElementById('contador-vestidos');
    if (contador) contador.textContent = filtrada.length + ' vestido' + (filtrada.length !== 1 ? 's' : '') + ' encontrados';

    if (!filtrada.length) {
        contenedor.className = 'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden';
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No se encontraron artículos.</p>';
        return;
    }

    const estadoCfg = {
        Disponible: { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500'  },
        Rentado:    { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
        Limpieza:   { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
        Apartado:   { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
    };
    const tipoIcon = { Vestido: 'checkroom', Zapato: 'shoe_heel', Bolsa: 'backpack', Accesorios: 'diamond' };

    if (vistaInventario === 'grid') {
        contenedor.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3';
        contenedor.innerHTML = '';
        filtrada.forEach(item => {
            const cfg     = estadoCfg[item.estado_actual] || { bg:'bg-gray-50', text:'text-gray-500', dot:'bg-gray-400' };
            const fotoUrl = obtenerUrlFoto(item.foto, 'sm');
            const card    = document.createElement('div');
            card.className = 'item-card bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md transition-all active:scale-95';
            card.innerHTML = `
                <img src="${fotoUrl}" class="w-full h-40 object-cover bg-gray-100" onerror="this.src='https://placehold.co/200x160/f5f1eb/8a8a8e?text=Foto'">
                <div class="p-3">
                    <p class="font-bold text-gray-900 text-xs truncate">${item.nombre||'—'}</p>
                    <p class="text-[10px] text-pink-500 font-mono mt-0.5 truncate">ID: ${item.codigo||item.id_articulo}</p>
                    <div class="flex items-center justify-between mt-2">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 ${cfg.bg} ${cfg.text} text-[10px] font-bold rounded-full">
                            <span class="w-1.5 h-1.5 ${cfg.dot} rounded-full"></span>${item.estado_actual}
                        </span>
                        <span class="text-pink-600 font-black text-sm">$${item.precio_base||0}</span>
                    </div>
                </div>`;
            card.onclick = () => abrirModal(item);
            contenedor.appendChild(card);
        });
    } else {
        contenedor.className = 'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden';
        contenedor.innerHTML = '';
        filtrada.forEach((item, idx) => {
            const cfg     = estadoCfg[item.estado_actual] || { bg:'bg-gray-50', text:'text-gray-500', dot:'bg-gray-400' };
            const fotoUrl = obtenerUrlFoto(item.foto, 'sm');
            const icon    = tipoIcon[(item.tipo||'Vestido')] || 'checkroom';
            const card    = document.createElement('div');
            card.className = `item-card flex items-center gap-3 lg:gap-4 px-4 py-3.5 cursor-pointer transition-all ${idx > 0 ? 'border-t border-gray-100' : ''}`;
            card.innerHTML = `
                <img src="${fotoUrl}" class="w-12 h-14 rounded-xl object-cover bg-gray-100 flex-shrink-0" onerror="this.src='https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'">
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-gray-900 text-sm truncate">${item.nombre||'—'}</p>
                    <p class="text-xs text-pink-500 font-mono mt-0.5">ID: ${item.codigo||item.id_articulo}</p>
                </div>
                <div class="hidden sm:flex items-center flex-shrink-0 w-14">
                    <span class="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg">${item.talla||'—'}</span>
                </div>
                <div class="hidden lg:flex items-center gap-1.5 flex-shrink-0 w-32">
                    <span class="material-icons-round text-gray-400 text-base">${icon}</span>
                    <div>
                        <p class="text-xs font-medium text-gray-700">${item.tipo||'Vestido'}s</p>
                        ${item.publicado ? '<p class="text-[10px] text-gray-400 flex items-center gap-0.5"><span class="material-icons-round" style="font-size:10px">language</span> Web</p>' : '<p class="text-[10px] text-gray-300">○ Oculto</p>'}
                    </div>
                </div>
                <div class="hidden md:flex items-center flex-shrink-0 w-28">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1.5 ${cfg.bg} ${cfg.text} text-xs font-bold rounded-full">
                        <span class="w-1.5 h-1.5 ${cfg.dot} rounded-full flex-shrink-0"></span>${item.estado_actual}
                    </span>
                </div>
                <div class="flex-shrink-0 w-16 text-right">
                    <p class="text-pink-600 font-black text-base">$${item.precio_base||0}</p>
                </div>
                <button class="p-2 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0" onclick="event.stopPropagation()">
                    <span class="material-icons-round text-gray-400 text-xl">more_vert</span>
                </button>`;
            card.onclick = () => abrirModal(item);
            contenedor.appendChild(card);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('buscador')?.addEventListener('input', e => {
        const bh = document.getElementById('buscador-header');
        if (bh) bh.value = e.target.value;
        renderizarInventario(datosGlobales.inventario);
    });
    document.getElementById('buscador-header')?.addEventListener('input', e => {
        const b = document.getElementById('buscador');
        if (b) b.value = e.target.value;
        renderizarInventario(datosGlobales.inventario);
    });
});

const ESTADO_BTN_BASE   = 'estado-btn px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5';
const ESTADO_BTN_ACTIVE = 'estado-btn px-4 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5';

function filtrarInventario(estado) {
    filtroActual = estado;
    document.querySelectorAll('.estado-btn').forEach(btn => {
        btn.className = btn.dataset.estado === estado ? ESTADO_BTN_ACTIVE : ESTADO_BTN_BASE;
    });
    actualizarBadgeFiltros();
    renderizarInventario(datosGlobales.inventario);
}

function abrirModal(item) {
    itemEditing = item;
    document.getElementById('modal-titulo').textContent    = item.nombre || '—';
    document.getElementById('modal-subtitulo').textContent = item.id_articulo + ' · Talla ' + item.talla;
    const toggle = document.getElementById('toggle-publicado');
    if (toggle) toggle.checked = !!item.publicado;

    // Precargar campos de edición
    document.getElementById('edit-nombre').value        = item.nombre || '';
    document.getElementById('edit-precio').value        = item.precio_base || '';
    document.getElementById('edit-color').value         = item.color || '';
    document.getElementById('edit-precio-venta').value  = item.precio_venta || '';
    document.getElementById('edit-tipo').value          = item.tipo || 'Vestido';
    document.getElementById('edit-destacado').checked   = !!item.destacado;
    actualizarTallaEdicion();
    document.getElementById('edit-talla').value         = item.talla || '';

    // Resetear al tab de estado
    cambiarTabModal('estado');

    document.getElementById('modal-editar').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function cerrarModal() {
    document.getElementById('modal-editar').classList.add('hidden');
    document.body.style.overflow = '';
    itemEditing = null;
}
async function guardarEstado(nuevoEstado) {
    if (!itemEditing) return;
    const idArticulo = itemEditing.id_articulo;
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === idArticulo);
    cerrarModal();
    const { error } = await sb.from('inventario').update({ estado_actual: nuevoEstado }).eq('id_articulo', idArticulo);
    if (error) { Swal.fire('Error','No se pudo actualizar.','error'); return; }
    if (idx !== -1) datosGlobales.inventario[idx].estado_actual = nuevoEstado;
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon:'success', title:'Marcado como ' + nuevoEstado, timer:1000, showConfirmButton:false });
}
async function cambiarVisibilidadWeb(publicado) {
    if (!itemEditing) return;
    const idArticulo = itemEditing.id_articulo;
    const { error } = await sb.from('inventario').update({ publicado }).eq('id_articulo', idArticulo);
    if (error) { Swal.fire('Error','No se pudo cambiar visibilidad.','error'); return; }
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === idArticulo);
    if (idx !== -1) {
        datosGlobales.inventario[idx].publicado = publicado;
        itemEditing.publicado = publicado;
    }
    renderizarInventario(datosGlobales.inventario);
}

function filtrarRentas(tipo) {
    filtroRentas = tipo;
    document.getElementById('chip-rentas-activas').className  = `px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tipo === 'activas'   ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`;
    document.getElementById('chip-rentas-historial').className = `px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${tipo === 'historial' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`;
    renderizarRentas(datosGlobales.rentas);
}

function renderizarRentas(lista) {
    const contenedor = document.getElementById('lista-rentas');
    if (!contenedor) return;
    const esHistorial = filtroRentas === 'historial';
    const visibles = lista.filter(r => esHistorial
        ? (r.estatus_renta === 'Finalizada' || r.estatus_renta === 'Cancelada')
        : (r.estatus_renta === 'Activa'     || r.estatus_renta === 'Entregada'));
    if (!visibles.length) {
        contenedor.innerHTML = `<p class="text-center text-gray-400 py-10 text-sm italic">${esHistorial ? 'Sin rentas en el historial.' : 'No hay rentas en curso.'}</p>`;
        return;
    }
    contenedor.innerHTML = '';
    visibles.forEach(r => {
        const cliente    = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const vestido    = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
        const saldo      = parseFloat(r.saldo_pendiente) || 0;
        const fotoUrl    = obtenerUrlFoto(vestido?.foto, 'sm');
        const entregada  = r.estatus_renta === 'Entregada';
        const finalizada = r.estatus_renta === 'Finalizada';
        const cancelada  = r.estatus_renta === 'Cancelada';
        const bgClass    = entregada ? 'bg-blue-50 border-blue-100'
                         : finalizada ? 'bg-gray-50 border-gray-100 opacity-80'
                         : cancelada  ? 'bg-red-50 border-red-100 opacity-70'
                         : 'bg-white border-gray-100';
        const nombreColor = entregada ? 'text-blue-600' : finalizada || cancelada ? 'text-gray-400' : 'text-pink-600';
        let badge = '';
        if (entregada) badge = '<span class="text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">Entregado</span>';
        else if (finalizada) badge = '<span class="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">Finalizada</span>';
        else if (cancelada)  badge = '<span class="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">Cancelada</span>';
        const card = document.createElement('div');
        card.className = `item-card rounded-2xl border p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all ${bgClass}`;
        card.innerHTML = `<img src="${fotoUrl}" class="w-14 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0" onerror="this.src='https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                    <p class="font-bold text-gray-900 text-sm truncate">${cliente?.nombre_completo||r.id_cliente||'—'}</p>
                    ${badge}
                </div>
                <p class="text-xs ${nombreColor} font-medium truncate mt-0.5">${nombreArticulo(r)}</p>
                <div class="flex gap-2 mt-1.5 text-[10px] text-gray-400">
                    <span>📅 ${r.fecha_evento||'—'}</span>
                    <span>↩ ${r.fecha_retorno||'—'}</span>
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="font-black text-sm ${saldo>0?'text-red-500':'text-green-600'}">$${saldo.toFixed(0)}</p>
                <p class="text-[9px] text-gray-400 mt-0.5">${saldo>0?'pendiente':'pagado'}</p>
            </div>`;
        card.onclick = () => abrirModalRenta(r);
        contenedor.appendChild(card);
    });
}

function abrirModalRenta(r) {
    rentaEditing = r;
    const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
    const vestido = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
    const fotoUrl = obtenerUrlFoto(vestido?.foto, 'lg');
    document.getElementById('renta-modal-foto').src           = fotoUrl;
    document.getElementById('renta-modal-cliente').textContent = cliente?.nombre_completo || r.id_cliente;
    document.getElementById('renta-modal-vestido').textContent = nombreArticulo(r);
    document.getElementById('renta-modal-id').textContent      = r.id_renta;
    document.getElementById('renta-modal-saldo').textContent   = '$' + (parseFloat(r.saldo_pendiente)||0).toFixed(2);
    document.getElementById('renta-modal-fecha-e').textContent = r.fecha_entrega || '—';
    document.getElementById('renta-modal-fecha-r').textContent = r.fecha_retorno || '—';
    document.getElementById('renta-modal-ajustes').textContent = r.ajustes || 'Sin ajustes registrados.';
    // Resetear editores
    document.getElementById('ajustes-edit-section').classList.add('hidden');
    document.getElementById('renta-modal-ajustes').classList.remove('hidden');
    document.getElementById('btn-editar-ajustes').textContent = 'Editar';
    document.getElementById('renta-edit-section').classList.add('hidden');
    document.getElementById('btn-editar-renta').textContent = 'Editar';

    const tel        = cliente?.telefono;
    const esActiva   = r.estatus_renta === 'Activa';
    const esEntregada= r.estatus_renta === 'Entregada';

    const btnWA = document.getElementById('btn-whatsapp-renta');
    if (tel) { btnWA.onclick = () => enviarRecordatorioWhatsApp(cliente, r, vestido); btnWA.classList.remove('hidden'); }
    else { btnWA.classList.add('hidden'); }
    document.getElementById('btn-recibo-renta').classList.toggle('hidden', !tel || !esEntregada);

    document.getElementById('renta-badge-status').classList.toggle('hidden', r.estatus_renta !== 'Finalizada');
    document.getElementById('renta-badge-entregada').classList.toggle('hidden', !esEntregada);

    document.getElementById('btn-entregar').classList.toggle('hidden', !esActiva);
    document.getElementById('btn-devolucion').classList.toggle('hidden', !esEntregada);
    document.getElementById('btn-cancelar').classList.toggle('hidden', !esActiva && !esEntregada);
    document.getElementById('modal-renta-detalle').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function cerrarModalRenta() {
    document.getElementById('modal-renta-detalle').classList.add('hidden');
    document.body.style.overflow = '';
    rentaEditing = null;
}
async function guardarEstadoRenta(nuevoEstado) {
    if (!rentaEditing) return;
    const idArticulo = rentaEditing.id_articulo;
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === idArticulo);
    cerrarModalRenta();
    await sb.from('inventario').update({ estado_actual: nuevoEstado }).eq('id_articulo', idArticulo);
    if (idx !== -1) datosGlobales.inventario[idx].estado_actual = nuevoEstado;
    Swal.fire({ icon:'success', title:'Vestido → ' + nuevoEstado, timer:1000, showConfirmButton:false });
}

async function cancelarRentaJS() {
    if (!rentaEditing) return;
    const r = { ...rentaEditing };
    const abono = parseFloat(r.abono) || 0;

    const opcs = {
        title: '¿Cancelar esta renta?',
        icon: 'warning',
        showCancelButton: true,
        cancelButtonText: 'No, conservar',
        cancelButtonColor: '#9ca3af',
        reverseButtons: true,
    };
    if (abono > 0) {
        opcs.html = `El cliente dejó un abono de <b>$${abono.toFixed(0)}</b>.<br><br>¿Qué hacemos con ese dinero?`;
        opcs.showDenyButton = true;
        opcs.confirmButtonText = 'Sin devolución';
        opcs.confirmButtonColor = '#ef4444';
        opcs.denyButtonText = `Dar crédito a favor ($${abono.toFixed(0)})`;
        opcs.denyButtonColor = '#6366f1';
    } else {
        opcs.text = 'La renta se marcará como cancelada.';
        opcs.confirmButtonText = 'Sí, cancelar';
        opcs.confirmButtonColor = '#ef4444';
    }

    const result = await Swal.fire(opcs);
    if (!result.isConfirmed && !result.isDenied) return;

    Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

    await sb.from('rentas').update({ estatus_renta: 'Cancelada', saldo_pendiente: 0 }).eq('id_renta', r.id_renta);

    if (result.isDenied && abono > 0) {
        const credEntry = {
            id_renta: 'CRED-' + Date.now().toString(16).slice(-8).toUpperCase(),
            id_cliente: r.id_cliente, id_articulo: null, estatus_renta: 'Credito',
            abono, saldo_pendiente: 0, total_renta: abono, descuento: 0,
            fecha_evento: new Date().toISOString().split('T')[0],
            fecha_entrega: new Date().toISOString().split('T')[0],
            fecha_retorno: new Date().toISOString().split('T')[0],
            documento_garantia: '', ajustes: `Crédito por cancelación de renta ${r.id_renta}`
        };
        const { data: credData } = await sb.from('rentas').insert(credEntry).select().single();
        if (credData) datosGlobales.rentas.push(credData);
    }

    if (r.id_articulo && r.id_articulo !== 'CREDITO') {
        await sb.from('inventario').update({ estado_actual: 'Disponible' }).eq('id_articulo', r.id_articulo);
        const iI = datosGlobales.inventario.findIndex(i => i.id_articulo === r.id_articulo);
        if (iI !== -1) datosGlobales.inventario[iI].estado_actual = 'Disponible';
    }

    const iR = datosGlobales.rentas.findIndex(rr => rr.id_renta === r.id_renta);
    if (iR !== -1) { datosGlobales.rentas[iR].estatus_renta = 'Cancelada'; datosGlobales.rentas[iR].saldo_pendiente = 0; }

    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    renderizarInventario(datosGlobales.inventario);

    const msg = result.isDenied && abono > 0
        ? `Se generó un crédito de $${abono.toFixed(0)} a favor del cliente.`
        : 'La renta fue cancelada sin devolución.';
    Swal.fire({ icon: 'success', title: 'Renta cancelada', text: msg, timer: 2500, showConfirmButton: false });
}
async function entregarVestidoJS() {
    if (!rentaEditing) return;
    const saldo = parseFloat(rentaEditing.saldo_pendiente) || 0;

    // Paso 1: documento de garantía (y avisar si hay saldo pendiente)
    const { value: docGarantia, isConfirmed } = await Swal.fire({
        title: 'Entregar vestido',
        html: saldo > 0
            ? `Se cobrará el saldo pendiente de <b>$${saldo.toFixed(0)}</b>.<br><br>¿Qué documento deja el cliente?`
            : '¿Qué documento deja el cliente?',
        input: 'select',
        inputOptions: { INE: 'INE', VISA: 'VISA', PASAPORTE: 'Pasaporte', LICENCIA: 'Licencia', Ninguno: 'Ninguno' },
        inputPlaceholder: 'Selecciona...',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Entregar vestido',
        confirmButtonColor: '#d63384',
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'Registrando entrega...', didOpen: () => Swal.showLoading() });

    const { error } = await sb.from('rentas').update({
        saldo_pendiente:    0,
        abono:              rentaEditing.total_renta,
        documento_garantia: docGarantia || '',
        estatus_renta:      'Entregada',
    }).eq('id_renta', rentaEditing.id_renta);

    if (error) { Swal.fire('Error', 'No se pudo registrar la entrega.', 'error'); return; }

    // Cambiar vestido de Apartado → Rentado al momento de entregar físicamente
    if (rentaEditing.id_articulo) {
        await sb.from('inventario').update({ estado_actual: 'Rentado' }).eq('id_articulo', rentaEditing.id_articulo);
        const iI = datosGlobales.inventario.findIndex(i => i.id_articulo === rentaEditing.id_articulo);
        if (iI !== -1) datosGlobales.inventario[iI].estado_actual = 'Rentado';
    }

    const idx = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (idx !== -1) {
        datosGlobales.rentas[idx].saldo_pendiente    = 0;
        datosGlobales.rentas[idx].abono              = rentaEditing.total_renta;
        datosGlobales.rentas[idx].documento_garantia = docGarantia || '';
        datosGlobales.rentas[idx].estatus_renta      = 'Entregada';
    }

    const snapRenta = { ...rentaEditing, saldo_pendiente: 0, documento_garantia: docGarantia || '', estatus_renta: 'Entregada' };
    const cliente   = datosGlobales.clientes.find(c => c.id_cliente === snapRenta.id_cliente);

    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);

    const telRaw = (cliente?.telefono || '').replace(/\D/g, '');
    const numWA  = telRaw.length === 10 ? '52' + telRaw : telRaw;

    const { isConfirmed: enviarWA } = await Swal.fire({
        icon: 'success',
        title: '¡Vestido entregado!',
        text: numWA ? '¿Enviar mensaje de entrega por WhatsApp?' : 'Entrega registrada correctamente.',
        showConfirmButton: !!numWA,
        confirmButtonText: 'Enviar WhatsApp',
        confirmButtonColor: '#25d366',
        showDenyButton: true,
        denyButtonText: numWA ? 'No enviar' : 'OK',
    });

    if (enviarWA && numWA) {
        const msg = [
            `Hola ${cliente?.nombre_completo || ''}! 🌸`,
            `¡Disfruta tu vestido! ✨`,
            `Recuerda devolverlo el ${snapRenta.fecha_retorno || '—'}`,
            `Cualquier duda, escríbenos 💕`,
        ].join('\n');
        window.open('https://wa.me/' + numWA + '?text=' + encodeURIComponent(msg), '_blank');
    }
}
async function recibirDevolucionJS() {
    if (!rentaEditing) return;
    const r = rentaEditing;

    const { isConfirmed } = await Swal.fire({
        title: 'Recibir devolución',
        html: `¿El cliente devolvió el vestido<br>y se le regresó su documento de garantía?`,
        icon: 'question',
        showCancelButton: true,
        cancelButtonText: 'No aún',
        confirmButtonText: 'Sí, cerrar renta',
        confirmButtonColor: '#2563eb',
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'Cerrando renta...', didOpen: () => Swal.showLoading() });

    const ops = [sb.from('rentas').update({ estatus_renta: 'Finalizada' }).eq('id_renta', r.id_renta)];
    if (r.id_articulo) ops.push(sb.from('inventario').update({ estado_actual: 'Limpieza' }).eq('id_articulo', r.id_articulo));
    await Promise.all(ops);

    const iR = datosGlobales.rentas.findIndex(x => x.id_renta === r.id_renta);
    if (iR !== -1) datosGlobales.rentas[iR].estatus_renta = 'Finalizada';
    const iI = datosGlobales.inventario.findIndex(i => i.id_articulo === r.id_articulo);
    if (iI !== -1) datosGlobales.inventario[iI].estado_actual = 'Limpieza';

    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    renderizarInventario(datosGlobales.inventario);

    Swal.fire({ icon: 'success', title: '¡Renta cerrada!', text: 'Vestido enviado a limpieza.', timer: 1500, showConfirmButton: false });
}
function toggleEditarRenta() {
    const seccion = document.getElementById('renta-edit-section');
    const btn     = document.getElementById('btn-editar-renta');
    const oculta  = seccion.classList.contains('hidden');
    if (oculta) {
        const r = rentaEditing;
        document.getElementById('renta-edit-total').value         = r.total_renta    || 0;
        document.getElementById('renta-edit-descuento').value     = r.descuento      || 0;
        document.getElementById('renta-edit-abono').value         = r.abono          || 0;
        document.getElementById('renta-edit-fecha-evento').value  = r.fecha_evento   || '';
        document.getElementById('renta-edit-fecha-entrega').value = r.fecha_entrega  || '';
        document.getElementById('renta-edit-fecha-retorno').value = r.fecha_retorno  || '';
        recalcularSaldoEdit();
        seccion.classList.remove('hidden');
        btn.textContent = 'Cancelar';
        seccion.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        seccion.classList.add('hidden');
        btn.textContent = 'Editar';
    }
}

function recalcularSaldoEdit() {
    const total = parseFloat(document.getElementById('renta-edit-total').value)     || 0;
    const desc  = parseFloat(document.getElementById('renta-edit-descuento').value) || 0;
    const abono = parseFloat(document.getElementById('renta-edit-abono').value)     || 0;
    const saldo = total - desc - abono;
    const el = document.getElementById('renta-edit-saldo-preview');
    el.textContent = '$' + saldo.toFixed(0);
    el.className = `font-black text-sm ${saldo > 0 ? 'text-red-500' : 'text-green-600'}`;
}

async function guardarRentaJS() {
    if (!rentaEditing) return;
    const total  = parseFloat(document.getElementById('renta-edit-total').value)     || 0;
    const desc   = parseFloat(document.getElementById('renta-edit-descuento').value) || 0;
    const abono  = parseFloat(document.getElementById('renta-edit-abono').value)     || 0;
    const saldo  = total - desc - abono;
    const fEvento   = document.getElementById('renta-edit-fecha-evento').value;
    const fEntrega  = document.getElementById('renta-edit-fecha-entrega').value;
    const fRetorno  = document.getElementById('renta-edit-fecha-retorno').value;

    Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

    const { error } = await sb.from('rentas').update({
        total_renta:     total,
        descuento:       desc,
        abono:           abono,
        saldo_pendiente: saldo,
        fecha_evento:    fEvento,
        fecha_entrega:   fEntrega,
        fecha_retorno:   fRetorno,
    }).eq('id_renta', rentaEditing.id_renta);

    if (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); return; }

    // Actualizar estado local y modal
    Object.assign(rentaEditing, { total_renta: total, descuento: desc, abono, saldo_pendiente: saldo, fecha_evento: fEvento, fecha_entrega: fEntrega, fecha_retorno: fRetorno });
    const idx = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (idx !== -1) Object.assign(datosGlobales.rentas[idx], rentaEditing);

    document.getElementById('renta-modal-saldo').textContent   = '$' + saldo.toFixed(2);
    document.getElementById('renta-modal-fecha-e').textContent = fEntrega || '—';
    document.getElementById('renta-modal-fecha-r').textContent = fRetorno || '—';
    document.getElementById('renta-edit-section').classList.add('hidden');
    document.getElementById('btn-editar-renta').textContent = 'Editar';
    renderizarRentas(datosGlobales.rentas);
    Swal.fire({ icon: 'success', title: '¡Renta actualizada!', timer: 1000, showConfirmButton: false });
}

function toggleEditarAjustes() {
    const vista   = document.getElementById('renta-modal-ajustes');
    const editor  = document.getElementById('ajustes-edit-section');
    const btn     = document.getElementById('btn-editar-ajustes');
    const editing = !editor.classList.contains('hidden');
    if (editing) {
        editor.classList.add('hidden');
        vista.classList.remove('hidden');
        btn.textContent = 'Editar';
    } else {
        document.getElementById('ajustes-textarea').value = rentaEditing?.ajustes || '';
        editor.classList.remove('hidden');
        vista.classList.add('hidden');
        btn.textContent = 'Cancelar';
        document.getElementById('ajustes-textarea').focus();
    }
}

async function guardarAjustesRenta() {
    if (!rentaEditing) return;
    const ajustes = document.getElementById('ajustes-textarea').value.trim();
    const { error } = await sb.from('rentas').update({ ajustes }).eq('id_renta', rentaEditing.id_renta);
    if (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); return; }
    rentaEditing.ajustes = ajustes;
    const idx = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (idx !== -1) datosGlobales.rentas[idx].ajustes = ajustes;
    document.getElementById('renta-modal-ajustes').textContent = ajustes || 'Sin ajustes registrados.';
    document.getElementById('ajustes-edit-section').classList.add('hidden');
    document.getElementById('renta-modal-ajustes').classList.remove('hidden');
    document.getElementById('btn-editar-ajustes').textContent = 'Editar';
    Swal.fire({ icon: 'success', title: '¡Ajustes guardados!', timer: 900, showConfirmButton: false });
}

function enviarReciboWhatsApp() {
    if (!rentaEditing) return;
    const r       = rentaEditing;
    const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
    const tel     = (cliente?.telefono || '').replace(/\D/g, '');
    if (!tel) { Swal.fire('Sin teléfono', 'El cliente no tiene teléfono registrado.', 'warning'); return; }
    const num   = tel.length === 10 ? '52' + tel : tel;
    const total = parseFloat(r.total_renta) || 0;
    const msg   = [
        `Hola ${cliente?.nombre_completo || ''}! 🌸`,
        `Recibo de tu renta ✨`,
        `Vestido: ${nombreArticulo(r)}`,
        `Evento: ${r.fecha_evento || '—'}`,
        `Entrega: ${r.fecha_entrega || '—'}`,
        `Devolución: ${r.fecha_retorno || '—'}`,
        `Documento: ${r.documento_garantia || 'Ninguno'}`,
        `Total pagado: $${total.toFixed(0)}`,
        `¡Gracias por tu preferencia! 💕`,
    ].join('\n');
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
}

function enviarRecordatorioWhatsApp(cliente, renta, vestido) {
    const tel = (cliente.telefono||'').replace(/\D/g,'');
    const num = tel.length === 10 ? '52'+tel : tel;
    const msg = `Hola ${cliente.nombre_completo} 👋\n\nTe recordamos que el vestido *${vestido?.nombre||''}* debe devolverse el *${renta.fecha_retorno}*.\n\nSaldo pendiente: *$${parseFloat(renta.saldo_pendiente||0).toFixed(2)}*\n\n¡Gracias por confiar en Als Dress! 💕`;
    window.open('https://wa.me/'+num+'?text='+encodeURIComponent(msg),'_blank');
}

function renderizarClientes() {
    const contenedor = document.getElementById('lista-clientes');
    if (!contenedor) return;
    if (!datosGlobales.clientes.length) {
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No hay clientes registrados.</p>';
        return;
    }
    contenedor.innerHTML = '';
    datosGlobales.clientes.forEach(c => {
        const rentas  = datosGlobales.rentas.filter(r => r.id_cliente === c.id_cliente);
        const inicial = (c.nombre_completo||'?')[0].toUpperCase();
        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all';
        card.innerHTML = `<div class="w-12 h-12 rounded-2xl bg-pink-50 flex items-center justify-center text-pink-600 font-bold text-xl border border-pink-100 flex-shrink-0">${inicial}</div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 text-sm">${c.nombre_completo}</p>
                <p class="text-[10px] text-gray-400 mt-0.5 font-mono">${c.id_cliente}</p>
            </div>
            <span class="text-[10px] bg-pink-50 text-pink-600 px-2.5 py-1 rounded-full font-bold border border-pink-100 flex-shrink-0">${rentas.length} rentas</span>`;
        card.onclick = () => abrirHistorialCliente(c);
        contenedor.appendChild(card);
    });
}

function toggleEditarCliente() {
    const seccion = document.getElementById('cliente-edit-section');
    const btn     = document.getElementById('btn-editar-cliente');
    const oculta  = seccion.classList.contains('hidden');
    if (oculta) {
        document.getElementById('cliente-edit-nombre').value = clienteEditing?.nombre_completo || '';
        document.getElementById('cliente-edit-tel').value    = clienteEditing?.telefono || '';
        seccion.classList.remove('hidden');
        btn.textContent = 'Cancelar';
        document.getElementById('cliente-edit-nombre').focus();
    } else {
        seccion.classList.add('hidden');
        btn.textContent = 'Editar';
    }
}

async function guardarClienteJS() {
    if (!clienteEditing) return;
    const nombre = document.getElementById('cliente-edit-nombre').value.trim();
    const tel    = document.getElementById('cliente-edit-tel').value.trim();
    if (!nombre) return Swal.fire('Falta nombre', 'El nombre no puede estar vacío.', 'warning');

    Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

    const { error } = await sb.from('clientes').update({ nombre_completo: nombre, telefono: tel }).eq('id_cliente', clienteEditing.id_cliente);
    if (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); return; }

    const idx = datosGlobales.clientes.findIndex(c => c.id_cliente === clienteEditing.id_cliente);
    if (idx !== -1) { datosGlobales.clientes[idx].nombre_completo = nombre; datosGlobales.clientes[idx].telefono = tel; }
    clienteEditing.nombre_completo = nombre;
    clienteEditing.telefono        = tel;

    // Actualizar lo visible en el modal
    document.getElementById('cliente-modal-nombre').textContent = nombre;
    const telRaw = tel.replace(/\D/g, '');
    const waEl   = document.getElementById('cliente-modal-whatsapp');
    if (telRaw) { waEl.href = 'https://wa.me/' + (telRaw.length === 10 ? '52' + telRaw : telRaw); waEl.classList.remove('hidden'); }
    else { waEl.classList.add('hidden'); }

    document.getElementById('cliente-edit-section').classList.add('hidden');
    document.getElementById('btn-editar-cliente').textContent = 'Editar';
    renderizarClientes();
    Swal.fire({ icon: 'success', title: '¡Cliente actualizado!', timer: 1000, showConfirmButton: false });
}

async function eliminarClienteJS() {
    if (!clienteEditing) return;

    const rentasActivas = datosGlobales.rentas.filter(r =>
        r.id_cliente === clienteEditing.id_cliente &&
        (r.estatus_renta === 'Activa' || r.estatus_renta === 'Entregada')
    );
    if (rentasActivas.length) {
        Swal.fire('No se puede eliminar', `Este cliente tiene ${rentasActivas.length} renta(s) activa(s). Ciérralas primero.`, 'warning');
        return;
    }

    const totalRentas = datosGlobales.rentas.filter(r => r.id_cliente === clienteEditing.id_cliente).length;
    const { isConfirmed } = await Swal.fire({
        title: '¿Eliminar cliente?',
        html: `Se eliminará a <b>${clienteEditing.nombre_completo}</b>${totalRentas ? ` y su historial de <b>${totalRentas} renta(s)</b>` : ''}.<br><br>Esta acción no se puede deshacer.`,
        icon: 'warning',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        confirmButtonText: 'Sí, eliminar',
        confirmButtonColor: '#ef4444',
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'Eliminando...', didOpen: () => Swal.showLoading() });

    // Borrar rentas primero para respetar el FK constraint
    if (totalRentas) {
        const { error: rentasError } = await sb.from('rentas').delete().eq('id_cliente', clienteEditing.id_cliente);
        if (rentasError) { Swal.fire('Error', 'No se pudo eliminar el historial: ' + rentasError.message, 'error'); return; }
    }

    const { error } = await sb.from('clientes').delete().eq('id_cliente', clienteEditing.id_cliente);
    if (error) { Swal.fire('Error', 'No se pudo eliminar: ' + error.message, 'error'); return; }

    // Limpiar datos locales
    datosGlobales.rentas   = datosGlobales.rentas.filter(r => r.id_cliente !== clienteEditing.id_cliente);
    datosGlobales.clientes = datosGlobales.clientes.filter(c => c.id_cliente !== clienteEditing.id_cliente);
    clienteEditing = null;
    document.getElementById('modal-cliente-historial').classList.add('hidden');
    renderizarClientes();
    renderizarRentas(datosGlobales.rentas);
    Swal.fire({ icon: 'success', title: '¡Cliente eliminado!', timer: 1200, showConfirmButton: false });
}

function abrirHistorialCliente(cliente) {
    clienteEditing = cliente;
    // Resetear sección de edición al abrir
    document.getElementById('cliente-edit-section').classList.add('hidden');
    document.getElementById('btn-editar-cliente').textContent = 'Editar';

    const rentas  = datosGlobales.rentas.filter(r => r.id_cliente === cliente.id_cliente);
    const inicial = (cliente.nombre_completo||'?')[0].toUpperCase();
    document.getElementById('cliente-modal-avatar').textContent = inicial;
    document.getElementById('cliente-modal-nombre').textContent = cliente.nombre_completo;
    document.getElementById('cliente-modal-id').textContent     = cliente.id_cliente;
    const rentasReales = rentas.filter(r => r.estatus_renta !== 'Credito' && r.estatus_renta !== 'Credito Usado');
    document.getElementById('cliente-total-rentas').textContent = rentasReales.length + ' Rentas';
    const credito = datosGlobales.rentas
        .filter(r => r.id_cliente === cliente.id_cliente && r.estatus_renta === 'Credito')
        .reduce((s, r) => s + (parseFloat(r.abono) || 0), 0);
    const creditoBadge = document.getElementById('cliente-credito-badge');
    if (credito > 0) { creditoBadge.textContent = '$' + credito.toFixed(0) + ' crédito'; creditoBadge.classList.remove('hidden'); }
    else { creditoBadge.classList.add('hidden'); }
    const tel  = (cliente.telefono||'').replace(/\D/g,'');
    const waEl = document.getElementById('cliente-modal-whatsapp');
    if (tel) { waEl.href = 'https://wa.me/'+(tel.length===10?'52'+tel:tel); waEl.classList.remove('hidden'); }
    else { waEl.classList.add('hidden'); }
    const lista = document.getElementById('lista-historial-cliente');
    lista.innerHTML = '';
    if (!rentas.length) {
        lista.innerHTML = '<p class="text-gray-400 text-sm italic text-center py-6">Sin rentas registradas.</p>';
    } else {
        rentas.forEach(r => {
            const saldo = parseFloat(r.saldo_pendiente) || 0;
            const estadoColor = r.estatus_renta === 'Finalizada' ? 'bg-green-100 text-green-700'
                : r.estatus_renta === 'Cancelada' ? 'bg-red-100 text-red-600'
                : r.estatus_renta === 'Credito'   ? 'bg-indigo-100 text-indigo-700'
                : 'bg-blue-100 text-blue-700';
            const div = document.createElement('div');
            div.className = 'bg-gray-50 rounded-2xl p-3 border border-gray-100';
            div.innerHTML = `<div class="flex justify-between items-start">
                <div><p class="font-bold text-sm text-gray-800">${nombreArticulo(r)}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Evento: ${r.fecha_evento||'—'}</p></div>
                <span class="text-xs font-black ${saldo>0?'text-red-500':'text-green-600'}">$${saldo.toFixed(0)}</span></div>
                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ${estadoColor}">${r.estatus_renta}</span>`;
            lista.appendChild(div);
        });
    }
    document.getElementById('modal-cliente-historial').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function renderizarCalendario() {
    const el = document.getElementById('calendar');
    if (!el) return;
    if (calendarInst) { calendarInst.destroy(); calendarInst = null; }
    const eventos = [];
    datosGlobales.rentas.filter(r => r.estatus_renta === 'Activa').forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const nombre  = cliente?.nombre_completo || r.id_cliente;
        if (r.fecha_entrega) eventos.push({ title:'📤 '+nombre, date:r.fecha_entrega, backgroundColor:'#d63384', borderColor:'#d63384' });
        if (r.fecha_retorno) eventos.push({ title:'📥 '+nombre, date:r.fecha_retorno, backgroundColor:'#6b7280', borderColor:'#6b7280' });
    });
    calendarInst = new FullCalendar.Calendar(el, {
        initialView:'dayGridMonth', locale:'es',
        headerToolbar:{ left:'prev', center:'title', right:'next' },
        events:eventos, height:'auto',
        eventClick: (info) => Swal.fire({ title:info.event.title, text:info.event.startStr, icon:'info', confirmButtonColor:'#d63384' })
    });
    calendarInst.render();
}

function renderizarDashboard() {
    const rentas = datosGlobales.rentas;
    const totalIngresos = rentas.reduce((s,r) => s+(parseFloat(r.abono)||0),0);
    const totalDeuda    = rentas.filter(r=>r.estatus_renta==='Activa').reduce((s,r) => s+(parseFloat(r.saldo_pendiente)||0),0);
    const vendidos      = datosGlobales.inventario.filter(i => i.estado_actual === 'Vendido');
    const totalVentas   = vendidos.reduce((s,i) => s+(parseFloat(i.precio_venta)||0),0);
    document.getElementById('kpi-ingresos').textContent  = '$'+totalIngresos.toLocaleString('es-MX');
    document.getElementById('kpi-deuda').textContent     = '$'+totalDeuda.toLocaleString('es-MX');
    document.getElementById('kpi-ventas').textContent    = '$'+totalVentas.toLocaleString('es-MX');
    document.getElementById('kpi-vendidos').textContent  = vendidos.length + ' vendido' + (vendidos.length !== 1 ? 's' : '');
    const porMes = {};
    rentas.forEach(r => { if (!r.fecha_entrega) return; const m = r.fecha_entrega.substring(0,7); porMes[m]=(porMes[m]||0)+(parseFloat(r.abono)||0); });
    const meses  = Object.keys(porMes).sort().slice(-6);
    const labels = meses.map(m => { const [y,mo]=m.split('-'); return ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mo)-1]+' '+y.slice(2); });
    const ctxM = document.getElementById('chart-mensual');
    if (ctxM) { if (ctxM._ci) ctxM._ci.destroy(); ctxM._ci = new Chart(ctxM,{ type:'bar', data:{ labels, datasets:[{ label:'Ingresos', data:meses.map(m=>porMes[m]||0), backgroundColor:'#d63384', borderRadius:8 }] }, options:{ plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} } }); }
    const estados = { Disponible:0, Rentado:0, Limpieza:0 };
    datosGlobales.inventario.forEach(i => { if (estados[i.estado_actual]!==undefined) estados[i.estado_actual]++; });
    const ctxE = document.getElementById('chart-estados');
    if (ctxE) { if (ctxE._ci) ctxE._ci.destroy(); ctxE._ci = new Chart(ctxE,{ type:'doughnut', data:{ labels:['Disponible','Rentado','Limpieza'], datasets:[{ data:[estados.Disponible,estados.Rentado,estados.Limpieza], backgroundColor:['#22c55e','#3b82f6','#eab308'], borderWidth:0 }] }, options:{ plugins:{legend:{position:'bottom'}}, cutout:'65%' } }); }
}


// ---- TALLA DINÁMICA EN EDICIÓN ----
function actualizarTallaEdicion() {
    const tipo      = document.getElementById('edit-tipo').value;
    const select    = document.getElementById('edit-talla');
    const contenedor = document.getElementById('edit-contenedor-talla');
    select.innerHTML = '';
    if (tipo === 'Vestido') {
        contenedor.style.display = 'block';
        ['2XS','XS','S','M','L','XL','2XL','3XL','4XL'].forEach(t => {
            const o = document.createElement('option'); o.value = t; o.text = t; select.add(o);
        });
    } else if (tipo === 'Zapato') {
        contenedor.style.display = 'block';
        for (let i = 2; i <= 7; i += 0.5) {
            const o = document.createElement('option'); o.value = String(i); o.text = i + ' MX'; select.add(o);
        }
    } else {
        contenedor.style.display = 'none';
        const o = document.createElement('option'); o.value = 'UNI'; o.text = 'Única'; select.add(o);
    }
}

// ---- TABS DEL MODAL ----
function cambiarTabModal(tab) {
    ['estado','editar','historial'].forEach(t => {
        document.getElementById('modal-content-' + t).classList.add('hidden');
        const btn = document.getElementById('modal-tab-' + t);
        btn.classList.remove('text-pink-600','border-pink-600');
        btn.classList.add('text-gray-400','border-transparent');
    });
    document.getElementById('modal-content-' + tab).classList.remove('hidden');
    const activeBtn = document.getElementById('modal-tab-' + tab);
    activeBtn.classList.add('text-pink-600','border-pink-600');
    activeBtn.classList.remove('text-gray-400','border-transparent');

    if (tab === 'historial') cargarHistorialVestido();
}

// ---- GUARDAR EDICIÓN ----
async function guardarEdicion() {
    if (!itemEditing) return;
    const item = { ...itemEditing };

    const nombre       = document.getElementById('edit-nombre').value.trim();
    const precio       = parseFloat(document.getElementById('edit-precio').value) || null;
    const talla        = document.getElementById('edit-talla').value;
    const color        = document.getElementById('edit-color').value.trim();
    const tipo         = document.getElementById('edit-tipo').value;
    const precio_venta = parseFloat(document.getElementById('edit-precio-venta').value) || null;
    const destacado    = document.getElementById('edit-destacado').checked;

    if (!nombre) return Swal.fire('Falta el nombre', 'El nombre no puede estar vacío.', 'warning');

    Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

    const { error } = await sb.from('inventario').update({
        nombre, precio_base: precio, talla, color, tipo, precio_venta, destacado
    }).eq('id_articulo', item.id_articulo);

    if (error) { Swal.fire('Error', 'No se pudo guardar.', 'error'); return; }

    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === item.id_articulo);
    if (idx !== -1) {
        datosGlobales.inventario[idx].nombre       = nombre;
        datosGlobales.inventario[idx].precio_base  = precio;
        datosGlobales.inventario[idx].talla        = talla;
        datosGlobales.inventario[idx].color        = color;
        datosGlobales.inventario[idx].tipo         = tipo;
        datosGlobales.inventario[idx].precio_venta = precio_venta;
        datosGlobales.inventario[idx].destacado    = destacado;
    }

    cerrarModal();
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon: 'success', title: '¡Guardado!', timer: 1000, showConfirmButton: false });
}

// ---- VENDER VESTIDO ----
async function venderVestido() {
    if (!itemEditing) return;
    const item = { ...itemEditing };

    const confirm = await Swal.fire({
        title: '¿Marcar como Vendido?',
        text: 'El vestido se ocultará del inventario y del catálogo público.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#7c3aed',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'Sí, vendido',
        cancelButtonText: 'Cancelar'
    });

    if (!confirm.isConfirmed) return;

    const { error } = await sb.from('inventario').update({
        estado_actual: 'Vendido',
        publicado: false
    }).eq('id_articulo', item.id_articulo);

    if (error) { Swal.fire('Error', 'No se pudo actualizar.', 'error'); return; }

    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === item.id_articulo);
    if (idx !== -1) {
        datosGlobales.inventario[idx].estado_actual = 'Vendido';
        datosGlobales.inventario[idx].publicado     = false;
    }

    cerrarModal();
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon: 'success', title: '¡Vestido vendido!', text: 'Ya no aparece en el inventario activo.', timer: 1500, showConfirmButton: false });
}

// ---- HISTORIAL DEL VESTIDO ----
function cargarHistorialVestido() {
    if (!itemEditing) return;
    const rentas  = datosGlobales.rentas.filter(r => r.id_articulo === itemEditing.id_articulo);
    const lista   = document.getElementById('modal-lista-historial');
    const total   = document.getElementById('modal-total-rentas');
    if (!lista) return;

    total.textContent = rentas.length + ' rentas';
    lista.innerHTML   = '';

    if (!rentas.length) {
        lista.innerHTML = '<p class="text-gray-400 text-sm italic text-center py-6">Sin rentas registradas.</p>';
        return;
    }

    rentas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const saldo   = parseFloat(r.saldo_pendiente) || 0;
        const estadoColor = r.estatus_renta === 'Finalizada' ? 'bg-green-100 text-green-700'
            : r.estatus_renta === 'Cancelada' ? 'bg-red-100 text-red-600'
            : 'bg-blue-100 text-blue-700';
        const div = document.createElement('div');
        div.className = 'bg-gray-50 rounded-2xl p-3 border border-gray-100';
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-sm text-gray-800">${cliente?.nombre_completo || r.id_cliente}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">Evento: ${r.fecha_evento || '—'}</p>
                </div>
                <span class="text-xs font-black ${saldo > 0 ? 'text-red-500' : 'text-green-600'}">$${saldo.toFixed(0)}</span>
            </div>
            <span class="text-[9px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ${estadoColor}">
                ${r.estatus_renta}
            </span>`;
        lista.appendChild(div);
    });
}

async function cerrarSesion() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
}
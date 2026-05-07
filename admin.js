// =============================================
// admin.js — Supabase
// =============================================

const datosGlobales = { inventario: [], rentas: [], clientes: [] };
let itemEditing  = null;
let rentaEditing = null;
let calendarInst = null;

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
    document.querySelectorAll('nav button').forEach(el => {
        el.classList.remove('active','border-pink-600','text-pink-600');
        el.classList.add('text-gray-400','border-transparent');
    });
    const seccion = document.getElementById('sec-' + tab);
    const boton   = document.getElementById('btn-tab-' + tab);
    if (seccion && boton) {
        seccion.classList.remove('hidden');
        boton.classList.add('active','border-pink-600','text-pink-600');
        boton.classList.remove('text-gray-400','border-transparent');
        if (tab === 'clientes')   renderizarClientes();
        if (tab === 'rentas')     renderizarRentas(datosGlobales.rentas);
        if (tab === 'finanzas')   renderizarDashboard();
        if (tab === 'calendario') setTimeout(() => renderizarCalendario(), 150);
    }
}

let filtroActual = '';
let tipoActual    = '';

function filtrarTipo(tipo) { tipoActual = tipo; renderizarInventario(datosGlobales.inventario); }

function renderizarInventario(lista) {
    const contenedor = document.getElementById('lista-admin');
    if (!contenedor) return;
    const busqueda = (document.getElementById('buscador')?.value || '').toLowerCase();
    const filtrada = lista.filter(i => {
        const txt  = !busqueda || (i.nombre||'').toLowerCase().includes(busqueda) || (i.id_articulo||'').toLowerCase().includes(busqueda);
        const est  = !filtroActual || i.estado_actual === filtroActual;
        const tipo = !tipoActual   || (i.tipo || 'Vestido') === tipoActual;
        return txt && est && tipo;
    });
    if (!filtrada.length) {
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No se encontraron artículos.</p>';
        return;
    }
    contenedor.innerHTML = '';
    filtrada.forEach(item => {
        const cfg = { Disponible:{color:'bg-green-100 text-green-700'}, Rentado:{color:'bg-blue-100 text-blue-700'}, Limpieza:{color:'bg-yellow-100 text-yellow-700'} }[item.estado_actual] || {color:'bg-gray-100 text-gray-500'};
        const fotoUrl = obtenerUrlFoto(item.foto, 'sm');
        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all';
        card.innerHTML = `<img src="${fotoUrl}" class="w-14 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0" onerror="this.src='https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'">
            <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 text-sm truncate">${item.nombre||'—'}</p>
                <p class="text-[10px] text-gray-400 font-mono mt-0.5">${item.codigo||item.id_articulo}</p>
                <div class="flex items-center gap-2 mt-1.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}">${item.estado_actual}</span>
                    <span class="text-[10px] text-gray-400">Talla: <b>${item.talla||'—'}</b></span>
                    ${item.publicado ? '<span class="text-[10px] text-pink-500 font-bold">● Web</span>' : '<span class="text-[10px] text-gray-300">○ Oculto</span>'}
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <p class="text-pink-600 font-black text-sm">$${item.precio_base||0}</p>
                <span class="material-icons-round text-gray-300 text-xl mt-1">chevron_right</span>
            </div>`;
        card.onclick = () => abrirModal(item);
        contenedor.appendChild(card);
    });
}
function renderizarRentas(lista) {
    const contenedor = document.getElementById('lista-rentas');
    if (!contenedor) return;
    const activas = lista.filter(r => r.estatus_renta === 'Activa');
    if (!activas.length) {
        contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm italic">No hay rentas activas.</p>';
        return;
    }
    contenedor.innerHTML = '';
    activas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
        const vestido = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
        const saldo   = parseFloat(r.saldo_pendiente) || 0;
        const fotoUrl = obtenerUrlFoto(vestido?.foto, 'sm');
        const card = document.createElement('div');
        card.className = 'item-card bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 cursor-pointer active:scale-95 transition-all';
        card.innerHTML = `<img src="${fotoUrl}" class="w-14 h-16 rounded-xl object-cover bg-gray-100 flex-shrink-0" onerror="this.src='https://placehold.co/60x72/f5f1eb/8a8a8e?text=Foto'">
            <div class="flex-1 min-w-0">
                <p class="font-bold text-gray-900 text-sm truncate">${cliente?.nombre_completo||r.id_cliente||'—'}</p>
                <p class="text-xs text-pink-600 font-medium truncate mt-0.5">${vestido?.nombre||r.id_articulo||'—'}</p>
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

function renderizarHistorial(lista) {
    const contenedor = document.getElementById('lista-historial');
    if(!contenedor) return;
    contenedor.innerHTML = '';
    const cerradas = lista.filter(r => r['Estatus_Renta'] !== 'Activa');
    if(cerradas.length === 0) { contenedor.innerHTML = '<p class="text-center text-gray-400 py-10 text-sm">Historial vacío.</p>'; return; }
    cerradas.forEach(r => {
        const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === r['ID_Cliente']);
        const nombreCliente = cliente ? (cliente['Nombre'] || cliente['Nombre_Completo']) : r['ID_Cliente'];
        contenedor.innerHTML += `
            <div onclick="abrirModalRenta('${r['ID_Renta']}')" class="bg-gray-50 p-4 rounded-2xl border border-gray-200 mb-3 cursor-pointer opacity-80 hover:opacity-100">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-600 text-sm">${nombreCliente}</h3>
                    <span class="text-[9px] bg-gray-200 text-gray-500 px-2 py-1 rounded-lg font-bold">CERRADA</span>
                </div>
                <div class="text-[11px] text-gray-500"><p>🆔 Renta: ${r['ID_Renta']}</p><p>🏁 ${r['Fecha_Retorno']}</p></div>
            </div>`;
    });
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

function abrirHistorialCliente(cliente) {
    const rentas  = datosGlobales.rentas.filter(r => r.id_cliente === cliente.id_cliente);
    const inicial = (cliente.nombre_completo||'?')[0].toUpperCase();
    document.getElementById('cliente-modal-avatar').textContent = inicial;
    document.getElementById('cliente-modal-nombre').textContent = cliente.nombre_completo;
    document.getElementById('cliente-modal-id').textContent     = cliente.id_cliente;
    document.getElementById('cliente-total-rentas').textContent = rentas.length + ' Rentas';
    const tel  = (cliente.telefono||'').replace(/\D/g,'');
    const waEl = document.getElementById('cliente-modal-whatsapp');
    if (tel) { waEl.href = 'https://wa.me/'+(tel.length===10?'52'+tel:tel); waEl.classList.remove('hidden'); }
    else { waEl.classList.add('hidden'); }
    const lista = document.getElementById('lista-historial-cliente');
    lista.innerHTML = '';
    if (!rentas.length) {
        lista.innerHTML = '<p class="text-gray-400 text-sm italic text-center py-6">Sin rentas registradas.</p>';
    } else {
        historial.forEach(r => {
            let nombreVestido = "Vestido";
            const idArticulo = r['ID_Articulo'] || Object.values(r)[12];
            const vestidoEncontrado = datosGlobales.inventario.find(i => i['ID_Articulo'] === idArticulo);
            if(vestidoEncontrado) nombreVestido = vestidoEncontrado['Nombre'];

            const esActiva = r['Estatus_Renta'] === 'Activa';
            const estadoTexto = esActiva ? 'EN CURSO' : 'FINALIZADA';
            const estadoClase = esActiva ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500';
            
            // Usando tu función limpiarDinero para el saldo
            const saldo = limpiarDinero(r['Saldo_Pendiente']);
            const saldoHTML = saldo > 0 ? `<span class="text-red-600 font-bold">Debe: $${saldo}</span>` : `<span class="text-green-600 font-bold">Pagado</span>`;

            elLista.innerHTML += `
                <div class="bg-gray-50 p-3 rounded-xl border border-gray-100 flex gap-3 items-start mb-2">
                    <span class="material-icons text-gray-300 mt-1">${esActiva ? 'timelapse' : 'check_circle'}</span>
                    <div class="flex-1">
                        <div class="flex justify-between items-start">
                            <h4 class="text-xs font-bold text-gray-800">👗 ${nombreVestido}</h4>
                            <span class="text-[8px] px-1.5 py-0.5 rounded font-bold ${estadoClase}">${estadoTexto}</span>
                        </div>
                        <div class="flex justify-between items-center mt-1">
                            <p class="text-[10px] text-gray-500">📅 ${r['Fecha_Retorno']}</p>
                            <p class="text-[10px]">${saldoHTML}</p>
                        </div>
                    </div>
                </div>`;
        });
    }

    elModal.classList.remove('hidden');
}

// --- DASHBOARD FINANCIERO ---
function renderizarDashboard() {
    let totalIngresos = 0;
    let deudaTotal = 0;
    let ingresosPorMes = {};

    datosGlobales.rentas.forEach(r => {
        if (!r['ID_Renta'] || r['Estatus_Renta'] === 'Cancelada') return;

        const monto = limpiarDinero(r['Total_Renta']);
        const saldo = limpiarDinero(r['Saldo_Pendiente']);
        const fechaRaw = r['Fecha_Evento']; 
        
        if (monto > 0) {
            totalIngresos += monto;
            deudaTotal += saldo;
            if(fechaRaw) {
                let mesKey = "";
                if (fechaRaw.includes('-')) {
                    mesKey = fechaRaw.substring(0, 7); 
                } else if (fechaRaw.includes('/')) {
                    const partes = fechaRaw.split('/');
                    if (partes.length === 3) mesKey = `${partes[2]}-${partes[1]}`;
                }
                if (mesKey) {
                    if(!ingresosPorMes[mesKey]) ingresosPorMes[mesKey] = 0;
                    ingresosPorMes[mesKey] += monto;
                }
            }
        }
    });

    document.getElementById('kpi-ingresos').innerText = "$" + totalIngresos.toLocaleString();
    document.getElementById('kpi-deuda').innerText = "$" + deudaTotal.toLocaleString();

    const mesesOrdenados = Object.keys(ingresosPorMes).sort();
    const dataMensual = mesesOrdenados.map(m => ingresosPorMes[m]);
    const labelsMensual = mesesOrdenados.map(m => {
        const [anio, mes] = m.split('-');
        const fechaObj = new Date(anio, mes - 1);
        return fechaObj.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
    });

    let estados = { 'Disponible': 0, 'Rentado': 0, 'Limpieza': 0 };
    datosGlobales.inventario.forEach(i => {
        const est = (i['Estado_Actual'] || 'Disponible').trim();
        if(estados[est] !== undefined) estados[est]++;
    });

    if(chartMensual) chartMensual.destroy();
    if(chartEstados) chartEstados.destroy();

    const ctx1 = document.getElementById('chart-mensual').getContext('2d');
    chartMensual = new Chart(ctx1, {
        type: 'bar',
        data: { labels: labelsMensual, datasets: [{ label: 'Ventas ($)', data: dataMensual, backgroundColor: '#ec4899', borderRadius: 4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    const ctx2 = document.getElementById('chart-estados').getContext('2d');
    chartEstados = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: ['Disponible', 'Rentado', 'Limpieza'], datasets: [{ data: [estados['Disponible'], estados['Rentado'], estados['Limpieza']], backgroundColor: ['#4ade80', '#60a5fa', '#facc15'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// --- MODAL DETALLE RENTA Y ACCIONES ---
function abrirModalRenta(idRenta) {
    const renta = datosGlobales.rentas.find(r => r['ID_Renta'] === idRenta);
    if(!renta) return;
    const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === renta['ID_Cliente']);
    document.getElementById('renta-modal-cliente').innerText = cliente ? (cliente['Nombre'] || cliente['Nombre_Completo']) : "Cliente";
    
    let idArticulo = renta['ID_Articulo'] || Object.values(renta)[12];
    let nombreVestido = renta['Fecha_Evento'] || "Vestido"; 
    let urlFoto = "";
    if (idArticulo) {
        const vestido = datosGlobales.inventario.find(i => i['ID_Articulo'] === idArticulo);
        if (vestido) {
            nombreVestido = vestido['Nombre'];
            const fotoRaw = vestido['Foto'] || "";
            urlFoto = fotoRaw.startsWith('http') ? fotoRaw : `https://www.appsheet.com/template/gettablefileurl?appName=${appName}&tableName=${tableName}&fileName=${encodeURIComponent(fotoRaw)}`;
        }
    }
    document.getElementById('renta-modal-vestido').innerText = nombreVestido;
    document.getElementById('renta-modal-id').innerText = idRenta;
    document.getElementById('renta-modal-ajustes').innerText = renta['Ajustes'] || "Sin ajustes.";
    document.getElementById('renta-modal-foto').src = urlFoto || 'https://placehold.co/100x120?text=Sin+Foto';
    document.getElementById('renta-modal-fecha-e').innerText = renta['Fecha_Entrega'] || "--";
    document.getElementById('renta-modal-fecha-r').innerText = renta['Fecha_Retorno'] || "--";
    
    const saldo = limpiarDinero(renta['Saldo_Pendiente']);
    document.getElementById('renta-modal-saldo').innerText = "$" + saldo;
    const zonaAcciones = document.getElementById('zona-acciones-renta');
    const badgeStatus = document.getElementById('renta-badge-status');
    const btnCobrar = document.getElementById('btn-cobrar');
    const btnFinalizar = document.getElementById('btn-finalizar');

    if (renta['Estatus_Renta'] !== 'Activa') {
        zonaAcciones.classList.add('hidden'); badgeStatus.classList.remove('hidden'); 
    } else {
        zonaAcciones.classList.remove('hidden'); badgeStatus.classList.add('hidden');
        if (saldo > 0) { btnCobrar.classList.remove('hidden'); btnFinalizar.classList.add('hidden'); } 
        else { btnCobrar.classList.add('hidden'); btnFinalizar.classList.remove('hidden'); }
    }
    const modal = document.getElementById('modal-renta-detalle');
    modal.dataset.idRenta = idRenta;
    modal.dataset.idArticulo = idArticulo || "";
    modal.classList.remove('hidden');
}

async function cobrarDeudaJS() {
    const idRenta = document.getElementById('modal-renta-detalle').dataset.idRenta;
    if(!confirm("¿Confirmar pago total?")) return;
    const btn = document.getElementById('btn-cobrar'); btn.innerText = "Procesando..."; btn.disabled = true;
    try { await fetch(`${urlAPI}?accion=liquidar_deuda&id=${idRenta}`, { method: "POST", mode: "no-cors" }); alert("✅ Pagado."); cerrarModalRenta(); location.reload(); } catch (e) { alert("Error"); btn.disabled = false; }
}

async function finalizarRentaJS() {
    const idRenta = document.getElementById('modal-renta-detalle').dataset.idRenta;
    const idArticulo = document.getElementById('modal-renta-detalle').dataset.idArticulo;
    if(!confirm("¿Recibir vestido y finalizar renta?")) return;
    const btn = document.getElementById('btn-finalizar'); btn.innerText = "Finalizando..."; btn.disabled = true;
    try { await fetch(`${urlAPI}?accion=finalizar_renta&id=${idRenta}`, { method: "POST", mode: "no-cors" }); if(idArticulo) await fetch(`${urlAPI}?accion=cambiar_estado&id=${idArticulo}&estado=Limpieza`, { method: "POST", mode: "no-cors" }); alert("✅ Cerrada."); cerrarModalRenta(); location.reload(); } catch (e) { alert("Error"); btn.disabled = false; }
}

async function guardarEstadoRenta(nuevoEstado) {
    const modal = document.getElementById('modal-renta-detalle');
    const idRenta = modal.dataset.idRenta; const idArticulo = modal.dataset.idArticulo;
    if(!idArticulo) return alert("Error ID Artículo");
    if(!confirm(`¿Cambiar estado a ${nuevoEstado}?`)) return;
    try { await fetch(`${urlAPI}?accion=cambiar_estado&id=${idArticulo}&estado=${nuevoEstado}`, { method: "POST", mode: "no-cors" }); if (idRenta && (nuevoEstado === 'Disponible' || nuevoEstado === 'Limpieza')) { await fetch(`${urlAPI}?accion=finalizar_renta&id=${idRenta}`, { method: "POST", mode: "no-cors" }); } alert("✅ Actualizado."); location.reload(); } catch (e) { alert("Error"); }
}

function cerrarModalRenta() { document.getElementById('modal-renta-detalle').classList.add('hidden'); }

function filtrarInventario(criterio) {
    if (!criterio) { 
        renderizarInventario(datosGlobales.inventario); 
        return; 
    }
    const filtrados = datosGlobales.inventario.filter(i => (i['Estado_Actual'] || '').trim() === criterio);
    renderizarInventario(filtrados);
}

function filtrarContenido(texto) {
    const t = texto.toLowerCase().trim();
    const filtrados = datosGlobales.inventario.filter(i => 
        (i['Nombre'] || '').toLowerCase().includes(t) || 
        (i['ID_Articulo'] || '').toLowerCase().includes(t)
    );
    renderizarInventario(filtrados);
}

// Modal Inventario Rápido
const modalInv = document.getElementById('modal-editar'); 
function abrirModalInventario(id, nombre, estado) { 
    document.getElementById('modal-titulo').innerText = nombre; 
    document.getElementById('modal-subtitulo').innerText = `ID: ${id}`; 
    modalInv.dataset.idActual = id; 
    
    // --- NUEVO: LEER ESTADO DE PUBLICACIÓN ---
    const vestido = datosGlobales.inventario.find(v => v['ID_Articulo'] === id);
    if (vestido) {
        // Si el Excel dice "SI", el switch se enciende. Si dice otra cosa o está vacío, se apaga.
        const estaPublicado = (vestido['Publicado'] || '').trim().toUpperCase() === 'SI';
        document.getElementById('toggle-publicado').checked = estaPublicado;
    }
    // -----------------------------------------

    modalInv.classList.remove('hidden'); 
}

function cerrarModal() { modalInv.classList.add('hidden'); } 

async function guardarEstado(nuevoEstado) { 
    const id = modalInv.dataset.idActual; 
    
    // 1. Definimos colores según el estado para darle estilo
    let colorBoton = '#22c55e'; // Verde para Disponible
    if (nuevoEstado === 'Limpieza') colorBoton = '#eab308'; // Amarillo
    if (nuevoEstado === 'Rentado') colorBoton = '#3b82f6';  // Azul

    // 2. Animación de Confirmación Elegante
    const confirmacion = await Swal.fire({
        title: `¿Mandar a ${nuevoEstado}?`,
        text: "El inventario se actualizará inmediatamente.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: colorBoton,
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar',
        reverseButtons: true, // Pone el botón de cancelar a la izquierda (mejor UX)
        backdrop: `rgba(0,0,0,0.6)` // Fondo oscuro borroso
    });

    if (confirmacion.isConfirmed) { 
        // 3. Animación de "Cargando..."
        Swal.fire({
            title: 'Actualizando...',
            html: 'Conectando con la base de datos ⚙️',
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading(); // Muestra la ruedita girando
            }
        });

        try {
            // 4. Disparamos la orden al servidor
            await fetch(`${urlAPI}?accion=cambiar_estado&id=${id}&estado=${nuevoEstado}`, { method: "POST", mode: "no-cors" }); 
            
            // 5. Animación de Éxito y recarga automática
            Swal.fire({
                title: '¡Listo!',
                text: `El vestido ahora está en ${nuevoEstado}.`,
                icon: 'success',
                timer: 1500, // Se cierra solo en 1.5 segundos
                showConfirmButton: false
            }).then(() => {
                cerrarModal();
                location.reload();
            });

        } catch (error) {
            Swal.fire('Error', 'Hubo un problema de conexión con el servidor.', 'error');
        }
    } 
}
// --- NUEVA FUNCIÓN: CAMBIAR VISIBILIDAD WEB ---
async function cambiarVisibilidadWeb(estaActivado) {
    const id = modalInv.dataset.idActual; 
    const nuevoEstado = estaActivado ? 'SI' : 'NO';

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
    });

    try {
        await fetch(`${urlAPI}?accion=cambiar_publicacion&id=${id}&estado=${nuevoEstado}`, { 
            method: "POST", 
            mode: "no-cors" 
        });

        Toast.fire({
            icon: 'success',
            title: nuevoEstado === 'SI' ? 'Visible en la web 🌐' : 'Oculto de la web 🚫'
        });

        // Actualizamos nuestro arreglo local para que no haya que recargar la página entera
        const vestido = datosGlobales.inventario.find(v => v['ID_Articulo'] === id);
        if(vestido) vestido['Publicado'] = nuevoEstado;

    } catch (error) {
        console.error("Error al actualizar visibilidad:", error);
        Swal.fire('Error', 'No se pudo actualizar en la nube. Revisa tu conexión.', 'error');
        // Revertir el switch si hubo error
        document.getElementById('toggle-publicado').checked = !estaActivado;
    }
}
// --- FUNCIÓN PARA EL CALENDARIO DE PUNTOS (CON CLIC A DETALLE) ---
function renderizarCalendario() {
    const calendarEl = document.getElementById('calendar');
    if(!calendarEl) return;

    const eventos = [];
    datosGlobales.rentas.forEach(r => {
        if(r['Estatus_Renta'] === 'Cancelada') return;
        
        const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === r['ID_Cliente']);
        const nombre = cliente ? (cliente['Nombre'] || 'Cliente') : 'Cliente';
        
        // 1. Punto de Salida (Rosa)
        if(r['Fecha_Entrega']) {
            eventos.push({
                title: `📤 OUT: ${nombre}`,
                start: r['Fecha_Entrega'],
                color: '#ec4899', 
                extendedProps: { idRenta: r['ID_Renta'] }
            });
        }
        
        // 2. Punto de Regreso (Gris)
        if(r['Fecha_Retorno']) {
            eventos.push({
                title: `📥 IN: ${nombre}`,
                start: r['Fecha_Retorno'],
                color: '#6b7280', 
                extendedProps: { idRenta: r['ID_Renta'] }
            });
        }
    });

    if(calendarInstance) calendarInstance.destroy();

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'es',
        height: 'auto',
        events: eventos,
        eventClick: (info) => {
            // AL DAR CLIC, SE ABRE TU MODAL CON TODA LA INFO:
            // Quien rentó, qué vestido, ajustes y saldo pendiente.
            abrirModalRenta(info.event.extendedProps.idRenta);
        }
    });
    calendarInstance.render();
}
// --- FUNCIÓN PARA ENVIAR RESUMEN POR WHATSAPP ---
function enviarTicketWhatsApp() {
    const modal = document.getElementById('modal-renta-detalle');
    const idRenta = modal.dataset.idRenta;
    const renta = datosGlobales.rentas.find(r => r['ID_Renta'] === idRenta);
    const cliente = datosGlobales.clientes.find(c => c['ID_Cliente'] === renta['ID_Cliente']);
    
    if(!cliente || !cliente['Telefono']) return Swal.fire('Sin Teléfono', 'No hay un número registrado.', 'warning');

    const tel = cliente['Telefono'].toString().replace(/\D/g, '');
    const vestido = document.getElementById('renta-modal-vestido').innerText;
    const saldo = document.getElementById('renta-modal-saldo').innerText;
    const retorno = document.getElementById('renta-modal-fecha-r').innerText;

    const mensaje = `👋 Hola ${cliente['Nombre']}, recordatorio de tu renta en *ALS Rent*:\n👗 *Vestido:* ${vestido}\n📅 *Devolución:* ${retorno}\n💰 *Saldo:* ${saldo}\n\n¡Te esperamos! ✨`;
    
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank');
}
// admin.js
function cerrarSesion() {
    localStorage.removeItem('als_sesion');
    window.location.href = 'index.html'; // <--- AQUÍ ESTÁ EL CAMBIO
}
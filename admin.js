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

function renderizarInventario(lista) {
    const contenedor = document.getElementById('lista-admin');
    if (!contenedor) return;
    const busqueda = (document.getElementById('buscador')?.value || '').toLowerCase();
    const filtrada = lista.filter(i => {
        const txt = !busqueda || (i.nombre||'').toLowerCase().includes(busqueda) || (i.id_articulo||'').toLowerCase().includes(busqueda);
        const est = !filtroActual || i.estado_actual === filtroActual;
        return txt && est;
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

document.getElementById('buscador')?.addEventListener('input', () => renderizarInventario(datosGlobales.inventario));
function filtrarInventario(estado) { filtroActual = estado; renderizarInventario(datosGlobales.inventario); }

function abrirModal(item) {
    itemEditing = item;
    document.getElementById('modal-titulo').textContent    = item.nombre || '—';
    document.getElementById('modal-subtitulo').textContent = item.id_articulo + ' · Talla ' + item.talla;
    const toggle = document.getElementById('toggle-publicado');
    if (toggle) toggle.checked = !!item.publicado;
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
    const item = { ...itemEditing }; // guardar copia antes de cerrar
    cerrarModal();

    const { error } = await sb.from('inventario')
        .update({ estado_actual: nuevoEstado })
        .eq('id_articulo', item.id_articulo);

    if (error) { Swal.fire('Error','No se pudo actualizar.','error'); return; }

    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === item.id_articulo);
    if (idx !== -1) datosGlobales.inventario[idx].estado_actual = nuevoEstado;
    renderizarInventario(datosGlobales.inventario);
    Swal.fire({ icon:'success', title:'Marcado como ' + nuevoEstado, timer:1000, showConfirmButton:false });
}
async function cambiarVisibilidadWeb(publicado) {
    if (!itemEditing) return;
    await sb.from('inventario').update({ publicado }).eq('id_articulo', itemEditing.id_articulo);
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === itemEditing.id_articulo);
    if (idx !== -1) datosGlobales.inventario[idx].publicado = publicado;
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

function abrirModalRenta(r) {
    rentaEditing = r;
    const cliente = datosGlobales.clientes.find(c => c.id_cliente === r.id_cliente);
    const vestido = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
    const fotoUrl = obtenerUrlFoto(vestido?.foto, 'lg');
    document.getElementById('renta-modal-foto').src           = fotoUrl;
    document.getElementById('renta-modal-cliente').textContent = cliente?.nombre_completo || r.id_cliente;
    document.getElementById('renta-modal-vestido').textContent = vestido?.nombre || r.id_articulo;
    document.getElementById('renta-modal-id').textContent      = r.id_renta;
    document.getElementById('renta-modal-saldo').textContent   = '$' + (parseFloat(r.saldo_pendiente)||0).toFixed(2);
    document.getElementById('renta-modal-fecha-e').textContent = r.fecha_entrega || '—';
    document.getElementById('renta-modal-fecha-r').textContent = r.fecha_retorno || '—';
    document.getElementById('renta-modal-ajustes').textContent = r.ajustes || 'Sin ajustes registrados.';
    const tel = cliente?.telefono;
    const btnWA = document.getElementById('btn-whatsapp-renta');
    if (tel) { btnWA.onclick = () => enviarRecordatorioWhatsApp(cliente, r, vestido); btnWA.classList.remove('hidden'); }
    else { btnWA.classList.add('hidden'); }
    const saldo = parseFloat(r.saldo_pendiente) || 0;
    document.getElementById('renta-badge-status').classList.toggle('hidden', r.estatus_renta !== 'Finalizada');
    document.getElementById('btn-cobrar').classList.toggle('hidden', saldo <= 0 || r.estatus_renta === 'Finalizada');
    document.getElementById('btn-finalizar').classList.toggle('hidden', saldo > 0 || r.estatus_renta === 'Finalizada');
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
    const renta = { ...rentaEditing };
    cerrarModalRenta();
    await sb.from('inventario').update({ estado_actual: nuevoEstado }).eq('id_articulo', renta.id_articulo);
    const idx = datosGlobales.inventario.findIndex(i => i.id_articulo === renta.id_articulo);
    if (idx !== -1) datosGlobales.inventario[idx].estado_actual = nuevoEstado;
    Swal.fire({ icon:'success', title:'Vestido → ' + nuevoEstado, timer:1000, showConfirmButton:false });
}
async function cobrarDeudaJS() {
    if (!rentaEditing) return;
    const renta = { ...rentaEditing };
    Swal.fire({ title:'Registrando pago...', didOpen:()=>Swal.showLoading() });
    const { error } = await sb.from('rentas').update({ saldo_pendiente:0, abono: rentaEditing.total_renta }).eq('id_renta', rentaEditing.id_renta);
    if (error) { Swal.fire('Error','No se pudo registrar.','error'); return; }
    const idx = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (idx !== -1) datosGlobales.rentas[idx].saldo_pendiente = 0;
    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    Swal.fire({ icon:'success', title:'¡Pago registrado!', timer:1200, showConfirmButton:false });
}
async function finalizarRentaJS() {
    if (!rentaEditing) return;
    const renta = { ...rentaEditing };
    Swal.fire({ title:'Finalizando renta...', didOpen:()=>Swal.showLoading() });
    await Promise.all([
        sb.from('rentas').update({ estatus_renta:'Finalizada' }).eq('id_renta', rentaEditing.id_renta),
        sb.from('inventario').update({ estado_actual:'Limpieza' }).eq('id_articulo', rentaEditing.id_articulo)
    ]);
    const iR = datosGlobales.rentas.findIndex(r => r.id_renta === rentaEditing.id_renta);
    if (iR !== -1) datosGlobales.rentas[iR].estatus_renta = 'Finalizada';
    const iI = datosGlobales.inventario.findIndex(i => i.id_articulo === rentaEditing.id_articulo);
    if (iI !== -1) datosGlobales.inventario[iI].estado_actual = 'Limpieza';
    cerrarModalRenta();
    renderizarRentas(datosGlobales.rentas);
    Swal.fire({ icon:'success', title:'¡Renta finalizada!', text:'Vestido enviado a limpieza.', timer:1500, showConfirmButton:false });
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
        rentas.forEach(r => {
            const vestido = datosGlobales.inventario.find(i => i.id_articulo === r.id_articulo);
            const saldo   = parseFloat(r.saldo_pendiente) || 0;
            const div = document.createElement('div');
            div.className = 'bg-gray-50 rounded-2xl p-3 border border-gray-100';
            div.innerHTML = `<div class="flex justify-between items-start">
                <div><p class="font-bold text-sm text-gray-800">${vestido?.nombre||r.id_articulo}</p>
                <p class="text-[10px] text-gray-400 mt-0.5">Evento: ${r.fecha_evento||'—'}</p></div>
                <span class="text-xs font-black ${saldo>0?'text-red-500':'text-green-600'}">$${saldo.toFixed(0)}</span></div>
                <span class="text-[9px] font-bold px-2 py-0.5 rounded-full mt-2 inline-block ${r.estatus_renta==='Finalizada'?'bg-green-100 text-green-700':'bg-blue-100 text-blue-700'}">${r.estatus_renta}</span>`;
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
    document.getElementById('kpi-ingresos').textContent = '$'+totalIngresos.toLocaleString('es-MX');
    document.getElementById('kpi-deuda').textContent    = '$'+totalDeuda.toLocaleString('es-MX');
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

async function cerrarSesion() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
}
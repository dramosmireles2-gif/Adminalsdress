// =============================================
// nueva-renta.js — Supabase
// =============================================

function obtenerUrlFoto(foto) {
    if (!foto) return 'https://placehold.co/50x60/f5f1eb/8a8a8e?text=Foto';
    if (foto.startsWith('http')) return foto;
    return `https://www.appsheet.com/template/gettablefileurl?appName=RentaVestidosAPP-250346467&tableName=Inventario&fileName=${encodeURIComponent(foto)}`;
}

let clientesData       = [];
let creditoDisponible  = 0;
let creditoAplicado    = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar sesión
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // Generar ID de renta
    const idRenta = 'R-' + Date.now().toString(16).slice(-8).toUpperCase();
    document.getElementById('id_renta').value = idRenta;

    // Fecha de entrega = hoy
    const hoy = new Date().toISOString().split('T')[0];
    const inputEntrega = document.getElementById('fecha_entrega');
    if (inputEntrega) {
        inputEntrega.value = hoy;
        inputEntrega.addEventListener('change', calcularFechaRetorno);
    }
    calcularFechaRetorno();

    // Cargar datos
    await cargarInventario();
    await cargarClientes();
    await cargarCreditosClientes();

    // Listeners de cálculo
    ['total','descuento','abono'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calcularSaldos);
    });
});

// ---- CRÉDITOS ----
let creditosData = [];
async function cargarCreditosClientes() {
    const { data } = await sb.from('rentas').select('id_cliente,abono,estatus_renta').eq('estatus_renta', 'Credito');
    creditosData = data || [];
}

function verificarCredito(idCliente) {
    creditoDisponible = creditosData
        .filter(r => r.id_cliente === idCliente)
        .reduce((s, r) => s + (parseFloat(r.abono) || 0), 0);
    creditoAplicado = false;
    const banner = document.getElementById('banner-credito');
    if (creditoDisponible > 0) {
        document.getElementById('credito-monto').textContent = '$' + creditoDisponible.toFixed(0);
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

function aplicarCredito() {
    const total  = parseFloat(document.getElementById('total').value) || 0;
    const aplicar = Math.min(creditoDisponible, total);
    document.getElementById('descuento').value = aplicar;
    calcularSaldos();
    creditoAplicado = true;
    const btn = document.querySelector('#banner-credito button');
    if (btn) { btn.textContent = '✓ Aplicado'; btn.disabled = true; btn.classList.add('opacity-50'); }
}

// ---- MODO EXTERNO ----
function toggleModoExterno() {
    const esExterno = document.getElementById('toggle-externo').checked;
    document.getElementById('seccion-inventario').classList.toggle('hidden', esExterno);
    document.getElementById('seccion-externo').classList.toggle('hidden', !esExterno);
    document.getElementById('id_articulo').value      = '';
    document.getElementById('nombre_articulo').value  = '';
    document.getElementById('selected-text').textContent = 'Toca para elegir artículo...';
    if (!esExterno) {
        document.getElementById('nombre-externo').value = '';
        document.getElementById('precio-externo').value = '';
    }
}

// ---- INVENTARIO ----
async function cargarInventario() {
    const lista = document.getElementById('lista-items');
    if (!lista) return;

    const { data, error } = await sb
        .from('inventario')
        .select('*')
        .eq('estado_actual', 'Disponible')
        .order('nombre');

    if (error) { lista.innerHTML = '<p class="p-3 text-red-500 text-xs">Error cargando inventario.</p>'; return; }

    lista.innerHTML = '';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 p-3 hover:bg-pink-50 cursor-pointer border-b border-gray-100 last:border-0 transition-colors';

        const fotoUrl = obtenerUrlFoto(item.foto);

        div.innerHTML = `
            <img src="${fotoUrl}" class="w-12 h-14 rounded-xl object-cover bg-gray-100 flex-shrink-0"
                 onerror="this.src='https://placehold.co/50x60/f5f1eb/8a8a8e?text=Foto'">
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gray-800 truncate">${item.nombre || 'Sin nombre'}</p>
                <p class="text-[10px] text-gray-400 uppercase mt-0.5">Talla: <span class="text-pink-500 font-bold">${item.talla || 'N/A'}</span></p>
            </div>
            <span class="text-sm font-black text-pink-600">$${item.precio_base || 0}</span>`;

        div.onclick = () => seleccionarVestido(item);
        lista.appendChild(div);
    });
}

function toggleDropdown() {
    document.getElementById('dropdown-list')?.classList.toggle('hidden');
}

function seleccionarVestido(item) {
    document.getElementById('id_articulo').value    = item.id_articulo;
    document.getElementById('nombre_articulo').value = item.nombre;
    document.getElementById('selected-text').innerHTML = `
        <div class="flex items-center gap-2 text-gray-800">
            <span class="text-pink-500 font-bold">[${item.talla}]</span> ${item.nombre}
        </div>`;
    const inputTotal = document.getElementById('total');
    if (inputTotal) inputTotal.value = item.precio_base || 0;
    calcularSaldos();
    toggleDropdown();
}

// ---- CÁLCULOS ----
function calcularSaldos() {
    const total    = parseFloat(document.getElementById('total')?.value) || 0;
    const desc     = parseFloat(document.getElementById('descuento')?.value) || 0;
    const abono    = parseFloat(document.getElementById('abono')?.value) || 0;
    const saldoEl  = document.getElementById('saldo');
    if (saldoEl) saldoEl.value = (total - desc - abono).toFixed(2);
}

function calcularFechaRetorno() {
    const entrega = document.getElementById('fecha_entrega');
    const retorno = document.getElementById('fecha_retorno');
    if (entrega?.value && retorno) {
        const fecha = new Date(entrega.value);
        fecha.setDate(fecha.getDate() + 4);
        retorno.value = fecha.toISOString().split('T')[0];
    }
}

// ---- CLIENTES ----
async function cargarClientes() {
    const { data, error } = await sb.from('clientes').select('*').order('nombre_completo');
    if (!error) clientesData = data || [];
}

function toggleClienteDropdown() {
    const dd = document.getElementById('cliente-dropdown');
    if (!dd) return;
    dd.classList.toggle('hidden');
    if (!dd.classList.contains('hidden')) {
        document.getElementById('input-busqueda-cliente')?.focus();
        renderizarListaClientes(clientesData);
    }
}

function filtrarClientes() {
    const busqueda = document.getElementById('input-busqueda-cliente')?.value.toLowerCase() || '';
    const filtrados = busqueda
        ? clientesData.filter(c => c.nombre_completo.toLowerCase().includes(busqueda))
        : clientesData;
    renderizarListaClientes(filtrados);
}

function renderizarListaClientes(lista) {
    const contenedor = document.getElementById('lista-clientes-sugerencias');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    if (lista.length === 0) {
        contenedor.innerHTML = '<p class="p-3 text-gray-400 text-xs text-center">No se encontraron clientes</p>';
        return;
    }

    lista.forEach(c => {
        const div = document.createElement('div');
        div.className = 'p-3 hover:bg-pink-50 cursor-pointer text-sm border-b border-gray-100 last:border-0 flex justify-between items-center transition-colors';
        div.innerHTML = `<span class="font-medium text-gray-800">${c.nombre_completo}</span>
                         <span class="text-[10px] text-gray-400 font-mono">${c.id_cliente}</span>`;
        div.onclick = () => {
            document.getElementById('id_cliente').value      = c.id_cliente;
            document.getElementById('nombre_cliente').value  = c.nombre_completo;
            document.getElementById('cliente-seleccionado').textContent = c.nombre_completo;
            document.getElementById('cliente-dropdown')?.classList.add('hidden');
            verificarCredito(c.id_cliente);
        };
        contenedor.appendChild(div);
    });
}

// ---- MODAL NUEVO CLIENTE ----
function abrirModalCliente()  { document.getElementById('modal-nuevo-cliente')?.classList.remove('hidden'); }
function cerrarModalCliente() { document.getElementById('modal-nuevo-cliente')?.classList.add('hidden'); }

async function guardarNuevoCliente() {
    const nombre = document.getElementById('nuevo-cliente-nombre').value.trim();
    const tel    = document.getElementById('nuevo-cliente-tel').value.trim();
    if (!nombre || !tel) return Swal.fire('Faltan datos', 'Nombre y teléfono son obligatorios.', 'warning');

    Swal.fire({ title: 'Registrando...', didOpen: () => Swal.showLoading() });

    const idCliente = 'C-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    const { data, error } = await sb.from('clientes').insert({
        id_cliente:      idCliente,
        nombre_completo: nombre,
        telefono:        tel
    }).select().single();

    if (error) return Swal.fire('Error', 'No se pudo guardar el cliente.', 'error');

    clientesData.push(data);
    document.getElementById('id_cliente').value      = data.id_cliente;
    document.getElementById('nombre_cliente').value  = data.nombre_completo;
    document.getElementById('cliente-seleccionado').textContent = data.nombre_completo;

    cerrarModalCliente();
    document.getElementById('nuevo-cliente-nombre').value = '';
    document.getElementById('nuevo-cliente-tel').value    = '';

    Swal.fire({ icon: 'success', title: 'Cliente registrado', timer: 1200, showConfirmButton: false });
}

// ---- CERRAR DROPDOWNS AL CLICK FUERA ----
window.addEventListener('click', (e) => {
    if (!e.target.closest('#dropdown-btn'))
        document.getElementById('dropdown-list')?.classList.add('hidden');
    if (!e.target.closest('#cliente-btn') && e.target.id !== 'input-busqueda-cliente')
        document.getElementById('cliente-dropdown')?.classList.add('hidden');
});

// ---- ENVIAR FORMULARIO ----
document.getElementById('form-renta')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const idCliente   = document.getElementById('id_cliente').value;
    const fechaEvento = document.getElementById('fecha_evento').value;
    const esExterno   = document.getElementById('toggle-externo').checked;

    let idArticulo = document.getElementById('id_articulo').value;

    if (esExterno) {
        const nombreExt = document.getElementById('nombre-externo').value.trim();
        if (!nombreExt) return Swal.fire('Falta nombre', 'Escribe el nombre del vestido.', 'warning');
        idArticulo = null; // null evita el error de llave foránea con Supabase
        const ajustesEl = document.getElementById('ajustes');
        ajustesEl.value = nombreExt + (ajustesEl.value.trim() ? '\n' + ajustesEl.value.trim() : '');
    }

    if (!idCliente)              return Swal.fire('Falta Cliente', 'Por favor selecciona un cliente.', 'warning');
    if (!idArticulo && !esExterno) return Swal.fire('Falta Vestido', 'Por favor selecciona un artículo.', 'warning');
    if (!fechaEvento) return Swal.fire('Falta Fecha',   'Indica la fecha del evento.', 'warning');

    Swal.fire({ title: 'Guardando Renta...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // 1. Guardar renta
        const { error: rentaError } = await sb.from('rentas').insert({
            id_renta:           document.getElementById('id_renta').value,
            id_cliente:         idCliente,
            id_articulo:        idArticulo,
            fecha_evento:       fechaEvento,
            fecha_entrega:      document.getElementById('fecha_entrega').value,
            fecha_retorno:      document.getElementById('fecha_retorno').value,
            total_renta:        parseFloat(document.getElementById('total').value) || 0,
            descuento:          parseFloat(document.getElementById('descuento').value) || 0,
            abono:              parseFloat(document.getElementById('abono').value) || 0,
            saldo_pendiente:    parseFloat(document.getElementById('saldo').value) || 0,
            estatus_renta:      'Activa',
            documento_garantia: '',
            ajustes:            document.getElementById('ajustes').value
        });
        if (rentaError) throw rentaError;

        // 2. Marcar como Apartado (reservado, pendiente de entrega física)
        if (!esExterno) {
            await sb.from('inventario').update({ estado_actual: 'Apartado' }).eq('id_articulo', idArticulo);
        }

        // 3. Si se aplicó crédito, marcar entradas de crédito como usadas
        if (creditoAplicado && creditoDisponible > 0) {
            const descAplicado = parseFloat(document.getElementById('descuento').value) || 0;
            await sb.from('rentas')
                .update({ estatus_renta: 'Credito Usado' })
                .eq('id_cliente', idCliente)
                .eq('estatus_renta', 'Credito');
            const remanente = creditoDisponible - descAplicado;
            if (remanente > 0.01) {
                await sb.from('rentas').insert({
                    id_renta: 'CRED-' + Date.now().toString(16).slice(-8).toUpperCase(),
                    id_cliente: idCliente, id_articulo: null, estatus_renta: 'Credito',
                    abono: remanente, saldo_pendiente: 0, total_renta: remanente, descuento: 0,
                    fecha_evento: fechaEvento, fecha_entrega: fechaEvento, fecha_retorno: fechaEvento,
                    documento_garantia: '', ajustes: 'Crédito remanente'
                });
            }
        }

        // Ticket de separado por WhatsApp
        Swal.close();
        const nombreCliente   = document.getElementById('nombre_cliente').value;
        const nombreVestido   = esExterno
            ? (document.getElementById('nombre-externo')?.value || 'Vestido externo')
            : (document.getElementById('nombre_articulo').value || 'Artículo');
        const fechaEventoVal  = document.getElementById('fecha_evento').value;
        const fechaEntregaVal = document.getElementById('fecha_entrega').value;
        const abonoVal        = parseFloat(document.getElementById('abono').value) || 0;
        const saldoVal        = parseFloat(document.getElementById('saldo').value) || 0;

        const clienteObj = clientesData.find(c => c.id_cliente === idCliente);
        const telRaw     = (clienteObj?.telefono || '').replace(/\D/g, '');
        const numWA      = telRaw.length === 10 ? '52' + telRaw : telRaw;

        const { isConfirmed: enviarWA } = await Swal.fire({
            icon: 'success',
            title: '¡Renta guardada!',
            text: numWA ? '¿Enviar ticket de separado por WhatsApp?' : 'Renta guardada correctamente.',
            showConfirmButton: !!numWA,
            confirmButtonText: 'Enviar WhatsApp',
            confirmButtonColor: '#25d366',
            showDenyButton: true,
            denyButtonText: numWA ? 'No, ir al admin' : 'Ir al admin',
        });

        if (enviarWA && numWA) {
            const msgSep = [
                `Hola ${nombreCliente}! 🌸`,
                `Tu vestido está separado ✨`,
                `Vestido: ${nombreVestido}`,
                `Evento: ${fechaEventoVal}`,
                `Abono: $${abonoVal.toFixed(0)}`,
                `Saldo pendiente: $${saldoVal.toFixed(0)}`,
                `Fecha de recogida: ${fechaEntregaVal}`,
                `¡Te esperamos! 💕`,
            ].join('\n');
            window.open('https://wa.me/' + numWA + '?text=' + encodeURIComponent(msgSep), '_blank');
        }

        window.location.href = 'admin.html';

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar: ' + (err.message || err), 'error');
    }
});
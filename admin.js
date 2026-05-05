// =============================================
// agregar.js — Supabase
// =============================================

let fotoArchivo = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar sesión
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }

    // Generar ID y código inicial
    generarID();
    cambiarOpcionesTalla();
});

// ---- ID único ----
function generarID() {
    const id = Date.now().toString(16).slice(-8);
    document.getElementById('id').value = id;
}

// ---- Tallas dinámicas ----
function cambiarOpcionesTalla() {
    const tipo = document.getElementById('tipo').value;
    const select = document.getElementById('talla');
    const contenedor = document.getElementById('contenedor-talla');
    select.innerHTML = '';

    if (tipo === 'Vestido') {
        contenedor.style.display = 'block';
        ['2XS','XS','S','M','L','XL','2XL','3XL','4XL'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.text = t;
            if (t === 'M') opt.selected = true;
            select.add(opt);
        });
    } else if (tipo === 'Zapato') {
        contenedor.style.display = 'block';
        for (let i = 2; i <= 7; i += 0.5) {
            const opt = document.createElement('option');
            opt.value = i.toString(); opt.text = i + ' MX';
            if (i === 4) opt.selected = true;
            select.add(opt);
        }
    } else {
        contenedor.style.display = 'none';
        const opt = document.createElement('option');
        opt.value = 'UNI'; opt.selected = true;
        select.add(opt);
    }
    actualizarCodigo();
}

function actualizarCodigo() {
    const talla  = document.getElementById('talla').value;
    const suffix = Math.random().toString(36).substr(2, 4).toUpperCase();
    document.getElementById('codigo').value = `${talla}-${suffix}`;
}

document.getElementById('tipo').addEventListener('change', cambiarOpcionesTalla);
document.getElementById('talla').addEventListener('change', actualizarCodigo);

// ---- Preview de foto ----
document.getElementById('input-foto').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    fotoArchivo = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('preview-img');
        img.src = e.target.result;
        img.classList.remove('hidden');
        document.getElementById('preview-placeholder').classList.add('hidden');
        document.getElementById('zona-foto').classList.add('tiene-foto');
    };
    reader.readAsDataURL(file);
});

// ---- Enviar formulario ----
document.getElementById('form-agregar').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!fotoArchivo) {
        Swal.fire('Falta la foto', 'La fotografía es obligatoria.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-guardar');
    btn.innerHTML = '<span class="material-icons-round animate-spin text-lg">sync</span> Subiendo...';
    btn.disabled = true;

    try {
        const formData = new FormData(document.getElementById('form-agregar'));
        const datos    = Object.fromEntries(formData);
        const idArt    = datos.id;

        // 1. Subir foto a Supabase Storage
        const ext      = fotoArchivo.name.split('.').pop();
        const rutaFoto = `inventario/${idArt}.${ext}`;

        const { error: storageError } = await sb.storage
            .from('fotos')
            .upload(rutaFoto, fotoArchivo, { upsert: true });

        if (storageError) throw storageError;

        // 2. Obtener URL pública de la foto
        const { data: urlData } = sb.storage.from('fotos').getPublicUrl(rutaFoto);
        const fotoUrl = urlData.publicUrl;

        // 3. Insertar en la tabla inventario
        const { error: dbError } = await sb.from('inventario').insert({
            id_articulo:   idArt,
            tipo:          datos.tipo,
            precio_base:   parseFloat(datos.precio) || null,
            talla:         datos.talla,
            color:         datos.color || '',
            estado_actual: 'Disponible',
            foto:          fotoUrl,
            codigo:        datos.codigo,
            nombre:        datos.nombre,
            publicado:     false
        });

        if (dbError) throw dbError;

        Swal.fire({
            icon: 'success',
            title: '¡Artículo guardado!',
            text: 'Se agregó correctamente al inventario.',
            showConfirmButton: false,
            timer: 1500
        }).then(() => { window.location.href = 'admin.html'; });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar: ' + (err.message || err), 'error');
        btn.innerHTML = '<span class="material-icons-round text-lg">cloud_upload</span> Guardar en Inventario';
        btn.disabled = false;
    }
});
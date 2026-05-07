// =============================================
// login.js — Supabase Auth
// =============================================

document.addEventListener('DOMContentLoaded', async () => {

    // Si ya hay sesión activa, ir directo al admin
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        window.location.href = 'admin.html';
        return;
    }

    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const pass  = document.getElementById('pass').value.trim();

        Swal.fire({
            title: 'Verificando...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

        if (error) {
            Swal.fire({
                icon: 'error',
                title: 'Acceso Denegado',
                text: 'Correo o contraseña incorrectos.'
            });
            return;
        }

        Swal.fire({
            icon: 'success',
            title: '¡Bienvenido!',
            text: 'Ingresando al sistema...',
            showConfirmButton: false,
            timer: 1200
        }).then(() => {
            window.location.href = 'admin.html';
        });
    });
});
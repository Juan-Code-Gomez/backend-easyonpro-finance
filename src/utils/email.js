const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: toEmail,
    subject: 'Recupera tu contraseña - EasyOnPro Finance',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #4F46E5;">EasyOnPro Finance 💰</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente botón para continuar. Este enlace expira en <strong>1 hora</strong>.</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background-color: #4F46E5;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: bold;
          margin: 16px 0;
        ">Restablecer contraseña</a>
        <p style="color: #6B7280; font-size: 13px;">
          Si no solicitaste esto, ignora este correo. Tu contraseña no cambiará.
        </p>
      </div>
    `,
  });
  console.log('Resend result:', JSON.stringify(result));
  if (result.error) throw new Error(result.error.message);
};

module.exports = { sendPasswordResetEmail };

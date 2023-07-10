document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
  
    socket.on('conversionFinished', (status) => {
      
    });
  
    socket.on('transcribeFinished', (transcription) => {
    });

    socket.on('processFileComplete', (id) => {

    });
});


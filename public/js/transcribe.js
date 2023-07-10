document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
  
    socket.on('uploadFinished', (status) => {
    });
  
    socket.on('transcribeFinished', (transcription) => {
    });

    socket.on('processFileComplete', (id) => {
      location.reload();  
    });
});


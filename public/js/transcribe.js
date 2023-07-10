document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
  
    socket.on('upload progress', (percent) => {
        console.log(percent)
      });
    
    socket.on('conversionFinished', (status) => {
      console.log("conversionFinished")
    });
  
    socket.on('transcribeFinished', (transcription) => {
        console.log("transcribeFinished")

    });

    socket.on('processFileComplete', (id) => {
        location.reload();
    });
});


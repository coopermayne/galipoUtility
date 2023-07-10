document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  socket.on('upload progress', (data) => {
      console.log(data.progress)
      document.querySelector(`#id_${data.id}`).textContent = `Up: ${Math.round(data.progress)}`;
  });
  
  socket.on('conversionFinished', (id) => {
      console.log("conversionFinished")
      document.querySelector(`#id_${id}`).textContent = "Transcribing...";
  });

  socket.on('transcribeFinished', (id) => {
      console.log("transcribeFinished")
      document.querySelector(`#id_${id}`).textContent = "Updating...";
  });

  socket.on('processFileComplete', (id) => {
    console.log("processFinished")
    document.querySelector(`#id_${id}`).textContent = "Complete";
  });
});

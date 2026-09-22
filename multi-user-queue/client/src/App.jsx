import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const socket = io(API_URL)

function App() {
  const [tasks, setTasks] = useState([])
  const [priority, setPriority] = useState('low')
  const [file, setFile] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('Idle')
  
  const fileInputRef = useRef(null)

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true)
    })

    socket.on('queue_update', (allTasks) => {
      const sortedTasks = allTasks.sort((a, b) => {
        if (a.priority === 'high' && b.priority === 'low') return -1;
        if (a.priority === 'low' && b.priority === 'high') return 1;
        return a.createdAt - b.createdAt;
      });
      setTasks(sortedTasks);
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    return () => {
      socket.off('connect')
      socket.off('queue_update')
      socket.off('disconnect')
    }
  }, [])

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setUploadStatus('File selected')
    }
  }

  const uploadFile = async () => {
    if (!file) {
      alert("Please select a file first!");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('priority', priority);
    formData.append('userId', socket.id);

    try {
      setUploadStatus('File uploading');
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setUploadStatus('File uploaded');
        setTimeout(() => {
          setFile(null);
          setUploadStatus('Idle');
          if (fileInputRef.current) fileInputRef.current.value = '';
        }, 2000);
      } else {
        const data = await response.json();
        setUploadStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setUploadStatus('Upload failed');
    }
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          DataFlow Queue Manager
        </div>
        <div className="topbar-status">
          <span className={`status-indicator ${isConnected ? 'online' : 'offline'}`}></span>
          {isConnected ? 'System Online' : 'Connecting...'}
        </div>
      </header>

      <main className="content">
        <div className="card upload-card">
          <div className="card-header">
            <h2>New Processing Job</h2>
            <p>Upload a CSV file to add it to the distributed processing queue.</p>
          </div>
          
          <div className="form-group">
            <div className="file-drop-area">
              <input 
                type="file" 
                id="file-upload" 
                accept=".csv" 
                onChange={handleFileChange} 
                ref={fileInputRef}
                className="file-input"
              />
              <div className="file-drop-content">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <span className="file-name">{file ? file.name : 'Choose a CSV file or drag & drop it here'}</span>
              </div>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group select-group">
              <label>Processing Priority</label>
              <select 
                value={priority} 
                onChange={(e) => setPriority(e.target.value)}
                className="select-input"
              >
                <option value="low">Standard Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>
            
            <button 
              onClick={uploadFile} 
              disabled={!file || !isConnected || uploadStatus === 'File uploading'}
              className="btn-primary"
            >
              {uploadStatus === 'File uploading' ? 'Uploading...' : 'Submit Job'}
            </button>
          </div>
          
          {uploadStatus !== 'Idle' && uploadStatus !== 'File selected' && (
            <div className={`alert ${uploadStatus.includes('Error') || uploadStatus.includes('failed') ? 'alert-error' : 'alert-success'}`}>
              {uploadStatus}
            </div>
          )}
        </div>

        <div className="card table-card">
          <div className="card-header">
            <h2>Active Queue ({tasks.length})</h2>
          </div>
          
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job ID</th>
                  <th>Filename</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty-state">No active or completed jobs in the queue.</td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={task.processId} className={task.userId === socket.id ? 'highlight-row' : ''}>
                      <td className="monospace text-muted">{task.processId.substring(0, 8)}</td>
                      <td className="font-medium">
                        {task.filename}
                        {task.userId === socket.id && <span className="badge badge-blue ml-2">Yours</span>}
                      </td>
                      <td>
                        <span className={`badge ${task.priority === 'high' ? 'badge-purple' : 'badge-gray'}`}>
                          {task.priority === 'high' ? 'High' : 'Standard'}
                        </span>
                      </td>
                      <td>
                        <div className="status-cell">
                          <span className={`status-dot bg-${getStatusColorClass(task.status)}`}></span>
                          {task.status.split(' (')[0]}
                        </div>
                      </td>
                      <td className="progress-cell">
                        <div className="progress-bar-bg">
                          <div 
                            className={`progress-bar-fill bg-${getStatusColorClass(task.status)}`}
                            style={{ width: `${task.progress}%` }}
                          ></div>
                        </div>
                        <span className="progress-text">{task.progress}%</span>
                      </td>
                      <td className="result-cell font-medium">
                        {task.result !== null ? task.result.toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}

function getStatusColorClass(status) {
  if (status.includes('Completed')) return 'success';
  if (status.includes('Processing')) return 'primary';
  if (status.includes('Error')) return 'danger';
  return 'warning';
}

export default App

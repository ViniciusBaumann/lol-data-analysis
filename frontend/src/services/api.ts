import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1/analytics',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '?';
    const status = error.response?.status;
    const data = error.response?.data;
    if (status) {
      console.error(`[api] ${error.config?.method?.toUpperCase()} ${url} -> ${status}`, data);
    } else {
      console.error(`[api] ${error.config?.method?.toUpperCase()} ${url} -> network error`, error.message);
    }
    return Promise.reject(error);
  },
);

export default api;

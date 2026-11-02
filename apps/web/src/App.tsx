import { Route, Routes } from 'react-router';

// 路由依 docs/03-App-Flow.md「路由表」
export function App() {
  return (
    <Routes>
      <Route path="/" element={<main />} />
    </Routes>
  );
}

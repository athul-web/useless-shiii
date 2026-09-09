import { Routes, Route } from 'react-router-dom';
import LandingScreen from './pages/LandingScreen';
import UntanglePage from './pages/UntanglePage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingScreen />} />
      <Route path="/untangle" element={<UntanglePage />} />
    </Routes>
  );
}

export default App;

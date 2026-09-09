import { useNavigate } from 'react-router-dom';
import './LandingScreen.css';

function LandingScreen() {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('/untangle');
  };

  return (
    <div className="landing-screen">
      <button className="start-button" onClick={handleStart}>
        Get Started Un-tying the Idiyappam
      </button>
    </div>
  );
}

export default LandingScreen;

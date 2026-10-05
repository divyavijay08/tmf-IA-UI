import {createRoot} from 'react-dom/client';
import {AssuranceApp} from './AssuranceApp';
import './styles.css';
import './typography.css';
import './workspace-shell.css';

createRoot(document.getElementById('root')!).render(<AssuranceApp/>);

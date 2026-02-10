import { useState, useCallback } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import { StepIndicator } from './ui/StepIndicator';
import { Step1_FileSelect, type ParsedSheetData } from './steps/Step1_FileSelect';
import { Step2_ColumnMapping } from './steps/Step2_ColumnMapping';
import { Step3_DataPreview } from './steps/Step3_DataPreview';
import { Step4_ImportComplete } from './steps/Step4_ImportComplete';
import type { ColumnMapping } from './helpers/columnDetector';
import { transformToProjects, saveMappingConfig } from './helpers/dataTransformer';
import { useProject } from '@/context/ProjectContext';
import { createProjectsFromSample } from '@/lib/parseExcel';
import { SAMPLE_DATA } from '@/lib/constants';
import type { Project } from '@/lib/types';

interface ImportWizardProps {
  onComplete: (file?: File) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const STEPS = [
  { label: 'Archivo', description: 'Seleccionar y hoja' },
  { label: 'Columnas', description: 'Mapeo de campos' },
  { label: 'Revisión', description: 'Validar datos' },
  { label: 'Listo', description: 'Importar' },
];

export function ImportWizard({ onComplete, onClose, isModal = false }: ImportWizardProps) {
  const { state, dispatch } = useProject();
  const [currentStep, setCurrentStep] = useState(1);
  const [sheetData, setSheetData] = useState<ParsedSheetData | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [importedProjects, setImportedProjects] = useState<Project[]>([]);
  const [importedFileName, setImportedFileName] = useState('');

  // Step 1: File loaded & sheet selected
  const handleStep1Complete = useCallback((data: ParsedSheetData) => {
    setSheetData(data);
    setCurrentStep(2);
  }, []);

  // Load sample data (skip wizard)
  const handleLoadSample = useCallback(() => {
    const projects = createProjectsFromSample(SAMPLE_DATA, state.config);
    dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: 'datos-ejemplo.xlsx' } });
    onComplete();
  }, [state.config, dispatch, onComplete]);

  // Step 2: Column mapping complete
  const handleStep2Complete = useCallback((newMappings: ColumnMapping[]) => {
    setMappings(newMappings);
    setCurrentStep(3);
  }, []);

  // Step 2: Quick import (high confidence, skip step 3)
  const handleQuickImport = useCallback((newMappings: ColumnMapping[]) => {
    if (!sheetData) return;
    
    setMappings(newMappings);
    
    const projects = transformToProjects(sheetData.rows, {
      mappings: newMappings,
      config: state.config,
    });

    // Save mapping config
    saveMappingConfig({
      fileName: sheetData.fileName,
      sheetName: sheetData.sheetName,
      headerRow: sheetData.headerRow,
      columnMappings: newMappings
        .filter(m => m.field)
        .map(m => ({ field: m.field!, excelColumn: m.excelColumn })),
      dateFormat: newMappings.find(m => m.detectedFormat)?.detectedFormat || 'Auto',
      timestamp: Date.now(),
    });

    dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: sheetData.fileName } });
    
    setImportedProjects(projects);
    setImportedFileName(sheetData.fileName);
    setCurrentStep(4);
  }, [sheetData, state.config, dispatch]);

  // Step 3: Validation complete, do import
  const handleStep3Complete = useCallback((skipRows: number[]) => {
    if (!sheetData) return;

    const projects = transformToProjects(sheetData.rows, {
      mappings,
      config: state.config,
      skipGroupRows: skipRows,
    });

    // Save mapping config
    saveMappingConfig({
      fileName: sheetData.fileName,
      sheetName: sheetData.sheetName,
      headerRow: sheetData.headerRow,
      columnMappings: mappings
        .filter(m => m.field)
        .map(m => ({ field: m.field!, excelColumn: m.excelColumn })),
      dateFormat: mappings.find(m => m.detectedFormat)?.detectedFormat || 'Auto',
      timestamp: Date.now(),
    });

    dispatch({ type: 'SET_PROJECTS', payload: { projects, fileName: sheetData.fileName } });

    setImportedProjects(projects);
    setImportedFileName(sheetData.fileName);
    setCurrentStep(4);
  }, [sheetData, mappings, state.config, dispatch]);

  // Step 4: Finish
  const handleFinish = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Go back to previous step
  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  }, []);

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-text-primary flex items-center justify-center">
            <FileSpreadsheet size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-primary">Importar datos</h1>
            <p className="text-xs text-text-secondary">
              {sheetData ? sheetData.fileName : 'Selecciona un archivo para comenzar'}
            </p>
          </div>
        </div>
        {(onClose || isModal) && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-secondary transition-colors text-text-secondary"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Step indicator */}
      <div className="border-b border-border bg-white">
        <StepIndicator currentStep={currentStep} steps={STEPS} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-6 bg-bg-secondary/30">
        {currentStep === 1 && (
          <Step1_FileSelect
            onComplete={handleStep1Complete}
            onLoadSample={handleLoadSample}
          />
        )}
        {currentStep === 2 && sheetData && (
          <Step2_ColumnMapping
            sheetData={sheetData}
            onComplete={handleStep2Complete}
            onBack={handleBack}
            onQuickImport={handleQuickImport}
          />
        )}
        {currentStep === 3 && sheetData && (
          <Step3_DataPreview
            sheetData={sheetData}
            mappings={mappings}
            onComplete={handleStep3Complete}
            onBack={handleBack}
          />
        )}
        {currentStep === 4 && (
          <Step4_ImportComplete
            projects={importedProjects}
            fileName={importedFileName}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );

  // Render as full page or modal
  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-bg-secondary flex flex-col">
      {content}
    </div>
  );
}

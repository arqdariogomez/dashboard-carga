import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  steps: { label: string; description: string }[];
}

export function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0 px-6 py-4">
      {steps.map((step, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <div key={index} className="flex items-center">
            {/* Step circle + text */}
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-[#2D6A2E] text-white'
                    : isActive
                    ? 'bg-text-primary text-white'
                    : 'bg-bg-secondary text-text-secondary border border-border'
                }`}
              >
                {isCompleted ? <Check size={14} strokeWidth={3} /> : stepNum}
              </div>
              <div className="hidden sm:block">
                <p
                  className={`text-xs font-medium leading-tight ${
                    isActive ? 'text-text-primary' : 'text-text-secondary'
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-[10px] text-text-secondary leading-tight">
                  {step.description}
                </p>
              </div>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`w-8 sm:w-12 h-px mx-2 sm:mx-3 transition-colors ${
                  stepNum < currentStep ? 'bg-[#2D6A2E]' : 'bg-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Question Screen Component
 * Displays the current question and options
 */

import React from 'react';
import { useAssessment } from './AssessmentProvider';
import { ProgressBar } from './ProgressBar';
import { OptionButton } from './OptionButton';

// Continue/Next Button Component
interface ContinueButtonProps {
  enabled: boolean;
  onClick: () => void;
  label: string;
}

function ContinueButton({ enabled, onClick, label }: ContinueButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`
        w-full px-6 py-6 text-base font-bold text-center rounded-lg
        transition-colors duration-200
        ${
          enabled
            ? 'bg-[#001010] text-white hover:bg-[#2E2E2E]'
            : 'bg-transparent text-[#BAB7A7] border-[3px] border-[#BAB7A7] cursor-not-allowed'
        }
      `}
    >
      {label}
    </button>
  );
}

export function QuestionScreen() {
  const {
    state,
    config,
    selectOption,
    goToNextQuestion,
    goToPreviousQuestion,
    submitAssessment,
    submissionError,
    clearSubmissionError,
  } = useAssessment();

  const currentQuestion = config.questions[state.currentQuestionIndex];
  const currentAnswer = state.answers.find((a) => a.questionId === currentQuestion.id);
  const canProceed = !!currentAnswer;
  const isFirstQuestion = state.currentQuestionIndex === 0;
  const isLastQuestion = state.currentQuestionIndex === config.questions.length - 1;
  const isSubmitting = state.status === 'submitting';

  const handleContinue = () => {
    if (!isLastQuestion) {
      goToNextQuestion();
      return;
    }

    if (submissionError || state.status === 'completed') {
      if (submissionError) {
        clearSubmissionError();
      }
      void submitAssessment();
      return;
    }

    goToNextQuestion();
  };

  return (
    <div className="min-h-screen bg-[#CECAB9] flex flex-col">
      {/* Top: Progress Bar */}
      <div className="w-full px-8 pt-6 pb-4 max-w-2xl mx-auto">
        <ProgressBar
          currentIndex={state.currentQuestionIndex}
          totalQuestions={config.questions.length}
        />
      </div>

      {/* Middle: Question and Selections - Centered Vertically */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-2xl mx-auto w-full">
        {/* Question Text */}
        <h1 className="text-4xl md:text-4xl font-semibold text-[#4F4234] text-left mb-4 antialiased w-full">
          {currentQuestion.text}
        </h1>
        {currentQuestion.helperText ? (
          <p className="text-base text-[#6B5F4F] text-left mb-8 antialiased w-full leading-relaxed">
            {currentQuestion.helperText}
          </p>
        ) : (
          <div className="mb-8" />
        )}

        {/* Options */}
        <div className="w-full space-y-3">
          {currentQuestion.options.map((option) => (
            <OptionButton
              key={option.id}
              optionId={option.id}
              label={option.label}
              isSelected={currentAnswer?.optionId === option.id}
              onClick={() => selectOption(option.id)}
            />
          ))}
        </div>
      </div>

      {/* Bottom: Next and Back Button - Aligned to bottom with matching spacing */}
      <div className="w-full px-8 pb-8 max-w-2xl mx-auto">
        {submissionError && isLastQuestion ? (
          <p
            role="alert"
            className="mb-4 text-sm text-[#8B3A2F] text-center antialiased"
          >
            {submissionError}
          </p>
        ) : null}
        <div className="w-full flex flex-col items-center space-y-0">
          <ContinueButton
            enabled={canProceed && !isSubmitting}
            onClick={handleContinue}
            label={
              isSubmitting
                ? 'Saving results...'
                : submissionError && isLastQuestion
                  ? 'Try again'
                  : isLastQuestion
                    ? 'See Results'
                    : 'Next'
            }
          />
          {!isFirstQuestion && (
            <button
              type="button"
              onClick={goToPreviousQuestion}
              className="w-full font-semibold pt-4 text-base text-center text-[#a4a08c] transition-colors duration-200 hover:opacity-80"
            >
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * Question Screen Component
 * Displays the current question and options
 */

import React from 'react';
import { useAssessment } from './AssessmentProvider';
import { ProgressBar } from './ProgressBar';
import { OptionButton } from './OptionButton';
import { Button } from '@/components/ui/Button';

export function QuestionScreen() {
  const { state, config, selectOption, goToNextQuestion, goToPreviousQuestion } = useAssessment();

  const currentQuestion = config.questions[state.currentQuestionIndex];
  const currentAnswer = state.answers.find((a) => a.questionId === currentQuestion.id);
  const canProceed = !!currentAnswer;
  const isFirstQuestion = state.currentQuestionIndex === 0;
  const isLastQuestion = state.currentQuestionIndex === config.questions.length - 1;

  return (
    <div className="min-h-screen bg-brand-900 flex flex-col">
      {/* Progress Bar */}
      <div className="w-full px-4 pt-6 pb-4">
        <ProgressBar
          currentIndex={state.currentQuestionIndex}
          totalQuestions={config.questions.length}
        />
      </div>

      {/* Question Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-2xl mx-auto w-full">
        {/* Question Text */}
        <h1 className="text-2xl md:text-3xl font-semibold text-white text-center mb-8 antialiased">
          {currentQuestion.text}
        </h1>

        {/* Options */}
        <div className="w-full space-y-3 mb-8">
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

        {/* Navigation */}
        <div className="w-full flex justify-between items-center">
          <Button
            variant="tertiary"
            onClick={goToPreviousQuestion}
            disabled={isFirstQuestion}
          >
            Previous
          </Button>

          <Button
            variant="primary"
            onClick={goToNextQuestion}
            disabled={!canProceed}
          >
            {isLastQuestion ? 'See Results' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}


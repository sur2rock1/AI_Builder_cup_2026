import React, { createContext, useContext } from 'react';
import { DEFAULT_TUTOR_NAME } from './tutorName';

/** The name this child gave their tutor. Components read it with useTutorName() instead of hardcoding one. */
const TutorNameContext = createContext<string>(DEFAULT_TUTOR_NAME);

export const TutorNameProvider: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => (
  <TutorNameContext.Provider value={name || DEFAULT_TUTOR_NAME}>{children}</TutorNameContext.Provider>
);

export const useTutorName = (): string => useContext(TutorNameContext);

/** For places that can't call a hook (expression-bodied components). */
export const TutorNameText: React.FC = () => <>{useTutorName()}</>;

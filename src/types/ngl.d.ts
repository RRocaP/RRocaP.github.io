declare module 'NGL' {
    export class Stage {
        constructor(elementId: string);
        loadFile(path: string, options?: any): Promise<any>;
        setSpin(axis: number[], speed: number): void;
        setParameters(parameters: any): void;
        handleResize(): void;
    }
}
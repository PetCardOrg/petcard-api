import '@petcardorg/shared';

declare module '@petcardorg/shared' {
  interface CarteiraDigitalResponseDto {
    weight?: number;
    upcoming_vaccines_count: number;
    upcoming_dewormings_count: number;
    active_medications_count: number;
  }
}

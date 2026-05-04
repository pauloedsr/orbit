export const geradorNumero = () => Math.floor(Math.random() * 100);

const numeroAleatorio = geradorNumero();

export const verificarPar = (n: number): string => {
  return n % 2 === 0 ? "É par" : "É ímpar";
};

console.log(`Número gerado: ${numeroAleatorio}`);
console.log(`Status: ${verificarPar(numeroAleatorio)}`);

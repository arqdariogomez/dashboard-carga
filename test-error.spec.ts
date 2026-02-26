import { test, expect } from '@playwright/test';

test('verificar error projectOrder', async ({ page }) => {
  // Configurar listener para errores de página
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('Error detectado:', error.message);
  });

  // Configurar listener para console
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('Console error:', msg.text());
    }
  });

  // Navegar a la aplicación
  await page.goto('http://localhost:5173/?board=3fb8f1ee-b2b5-4f18-92dc-59dc93210783');

  // Esperar a que la página cargue
  await page.waitForTimeout(3000);

  // Verificar si hay errores
  const projectOrderErrors = errors.filter(error => 
    error.includes('projectOrder') && 
    error.includes('Cannot read properties of undefined')
  );

  if (projectOrderErrors.length > 0) {
    console.log('❌ Error projectOrder encontrado:', projectOrderErrors[0]);
    
    // Tomar screenshot del error
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
    
    // Obtener el stack trace completo
    const errorDetails = projectOrderErrors[0];
    console.log('Stack trace completo:', errorDetails);
    
    throw new Error(`Error projectOrder detectado: ${errorDetails}`);
  } else {
    console.log('✅ No se detectaron errores de projectOrder');
    
    // Verificar que la tabla cargue
    const tableElement = page.locator('table, .table, [data-testid="table"]');
    await expect(tableElement.first()).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Tabla cargada correctamente');
  }
});

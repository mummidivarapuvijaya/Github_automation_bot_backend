import { prisma } from './src/db';

async function main(){
  try {
    await prisma.$connect();
    console.log('✅ MongoDB connection successful');
  } catch (e) {
    console.error('❌ MongoDB connection failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  
  // Handle ISO string or simple YYYY-MM-DD
  let datePart = dateStr;
  if (dateStr.includes('T')) {
    datePart = dateStr.split('T')[0];
  }
  
  // Check if it matches YYYY-MM-DD
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    // Return as DD-MM-YYYY
    return `${day}-${month}-${year}`;
  }
  
  return dateStr;
};

export const parseDate = (dateStr: string): string => {
  // Convert DD-MM-YYYY back to YYYY-MM-DD for inputs if needed
  // This might not be needed if inputs use YYYY-MM-DD value internally
  return dateStr;
};

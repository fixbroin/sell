
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast'; // Import useToast

interface QuantitySelectorProps {
  initialQuantity?: number;
  minQuantity?: number;
  enforcedMinQuantity?: number | null; // New prop
  maxQuantity?: number | null;
  onQuantityChange: (quantity: number) => void;
  className?: string;
}

const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  initialQuantity = 1,
  minQuantity = 0,
  enforcedMinQuantity = 0,
  maxQuantity = 99,
  onQuantityChange,
  className = '',
}) => {
  const [quantity, setQuantity] = useState(initialQuantity);
  const { toast } = useToast();

  useEffect(() => {
    setQuantity(initialQuantity);
  }, [initialQuantity]);

  const handleIncrement = () => {
    const effectiveMax = maxQuantity ?? 99;
    if (quantity >= effectiveMax) {
      toast({
        title: "Limit Reached",
        description: `You have reached the maximum limit of ${effectiveMax} units for this service.`,
        variant: "destructive",
      });
      return;
    }
    
    // If current is 0 and there's an enforced min, jump to it
    let newQuantity = quantity + 1;
    const effectiveEnforcedMin = enforcedMinQuantity ?? 0;
    if (quantity === 0 && effectiveEnforcedMin > 0) {
      newQuantity = effectiveEnforcedMin;
    }
    
    setQuantity(newQuantity);
    onQuantityChange(newQuantity);
  };

  const handleDecrement = () => {
    let newQuantity = quantity - 1;
    
    // Logic: If current quantity is equal to enforcedMinQuantity, next step is 0
    const effectiveEnforcedMin = enforcedMinQuantity ?? 0;
    if (effectiveEnforcedMin > 0 && quantity <= effectiveEnforcedMin) {
      newQuantity = 0;
    }
    
    newQuantity = Math.max(newQuantity, minQuantity);
    setQuantity(newQuantity);
    onQuantityChange(newQuantity);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(event.target.value, 10);
    if (isNaN(value)) {
      value = minQuantity;
    }
    
    const effectiveMax = maxQuantity ?? 99;
    if (value > effectiveMax) {
      value = effectiveMax;
      toast({
        title: "Maximum Quantity Exceeded",
        description: `You can only add up to ${effectiveMax} units.`,
        variant: "default",
      });
    }

    const effectiveEnforcedMin = enforcedMinQuantity ?? 0;
    if (value > 0 && effectiveEnforcedMin > 0 && value < effectiveEnforcedMin) {
        value = effectiveEnforcedMin;
    }

    value = Math.max(minQuantity, value);
    setQuantity(value);
    onQuantityChange(value);
  };

  return (
    <div 
      className={`flex items-center space-x-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDecrement();
        }}
        disabled={quantity === 0}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        type="number"
        className="h-8 w-12 text-center px-1"
        value={quantity}
        onChange={handleChange}
        onBlur={(e) => { // Handles case where user leaves the input empty
            if(e.target.value === '') {
                const newQuantity = minQuantity > 0 ? minQuantity : 0;
                setQuantity(newQuantity);
                onQuantityChange(newQuantity);
            }
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.focus();
        }}
        min={minQuantity}
        max={maxQuantity ?? undefined}
        aria-label="Quantity"
      />
      <Button
        variant="outline"
        size="icon"
        className={`h-8 w-8 ${quantity >= (maxQuantity ?? 99) ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleIncrement();
        }}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default QuantitySelector;
